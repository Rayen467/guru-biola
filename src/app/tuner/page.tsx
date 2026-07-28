"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePitch } from "@/lib/usePitch";
import {
  DEFAULT_A4,
  MAX_A4,
  MIN_A4,
  VIOLIN_STRINGS,
  centsBetween,
  freqToNote,
  midiToFreq,
  setA4,
  useA4,
} from "@/lib/notes";
import { playTone } from "@/lib/tone";
import BowFeedback from "@/components/BowFeedback";
import SessionEval from "@/components/SessionEval";
import { useSessionEval } from "@/lib/sessionEval";
import {
  DEFAULT_SENSITIVITY,
  sensitivityLabel,
  setSensitivity,
  useSensitivity,
} from "@/lib/micSettings";

const IN_TUNE = 5; // ±cent dianggap pas
const FINE_TUNER_MAX = 30; // di bawah ini cukup fine tuner, di atasnya pasak
const FAR_CENTS = 300; // lebih jauh dari ini dari semua senar = bukan senar kosong
const HYSTERESIS = 30; // biar lock senar gak loncat-loncat di perbatasan

interface Reading {
  freq: number; // median, sudah di-smooth
  stringIdx: number; // senar yang ke-lock otomatis
  cents: number; // selisih terhadap TARGET SENAR itu (bukan nada terdekat)
}

export default function TunerPage() {
  const sensitivity = useSensitivity();
  // Petik vs gesek: nada petikan cuma bunyi sebentar, jadi syarat "nada harus
  // bertahan" beda. Dipilih user, bukan ditebak app.
  const [pluck, setPluck] = useState(false);
  // null = otomatis (app nebak senarnya). Angka = senar yang DIKUNCI user.
  // Auto itu enak pas senarnya udah deket; pas masih jauh (senar baru, pasak
  // molor), nada yang kebaca bisa lebih dekat ke senar sebelah dan targetnya
  // loncat sendiri. Makanya harus bisa dikunci manual.
  const [lockString, setLockString] = useState<number | null>(null);
  const {
    freq,
    clarity,
    volumeDb,
    peak,
    active,
    error,
    noisy,
    calibrating,
    noiseFloorDb,
    reason,
    relax,
    rawFreq,
    start,
    stop,
  } = usePitch({ sensitivity, pluck });
  const a4 = useA4();
  // evaluasi otomatis: dikumpulin selama mic nyala, keluar begitu distop
  const { report, clear } = useSessionEval({
    active,
    freq,
    volumeDb,
    peak,
    reason,
  });
  const [reading, setReading] = useState<Reading | null>(null);
  const hist = useRef<number[]>([]);
  const lastValidAt = useRef(0);
  const lockedRef = useRef<number | null>(null);

  // Smoothing: median 9 bacaan terakhir — jarum kalem, salah-oktaf sesaat kebuang.
  // Lock senar otomatis dengan histeresis biar gak flip-flop di tengah-tengah.
  useEffect(() => {
    if (!active) {
      hist.current = [];
      lockedRef.current = null;
      setReading(null);
      return;
    }
    const now = performance.now();
    if (freq !== null) {
      hist.current.push(freq);
      if (hist.current.length > 9) hist.current.shift();
      lastValidAt.current = now;
      if (hist.current.length >= 3) {
        const sorted = [...hist.current].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const diffs = VIOLIN_STRINGS.map((s) =>
          centsBetween(median, midiToFreq(s.midi))
        );
        let best = 0;
        for (let i = 1; i < diffs.length; i++) {
          if (Math.abs(diffs[i]) < Math.abs(diffs[best])) best = i;
        }
        const prev = lockedRef.current;
        // Senar yang dikunci user menang mutlak — jangan dipindah app.
        const idx =
          lockString !== null
            ? lockString
            : prev !== null &&
                Math.abs(diffs[prev]) <= Math.abs(diffs[best]) + HYSTERESIS
              ? prev
              : best;
        lockedRef.current = idx;
        setReading({ freq: median, stringIdx: idx, cents: Math.round(diffs[idx]) });
      }
    } else if (now - lastValidAt.current > 700) {
      // senyap lama → kosongkan, tapi jangan langsung (jeda antar gesekan wajar)
      hist.current = [];
      setReading(null);
    }
  }, [freq, clarity, active, a4, lockString]);

  const str = reading ? VIOLIN_STRINGS[reading.stringIdx] : null;
  const strFreq = str ? midiToFreq(str.midi) : 0;
  const cents = reading?.cents ?? 0;
  const inTune = reading !== null && Math.abs(cents) <= IN_TUNE;
  // Pas senar dikunci manual, jangan cepat-cepat bilang "bukan senar kosong":
  // senar yang kendor banget emang bisa meleset jauh, dan justru itu yang mau
  // dibenerin. Batasnya dilebarin jadi hampir satu oktaf.
  const farLimit = lockString !== null ? 900 : FAR_CENTS;
  const tooFar = reading !== null && Math.abs(cents) > farLimit;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">🎯 Tuner</h1>
        <p className="mt-1 text-sm text-muted">
          Nyalain mic, gesek SATU senar tanpa mencet jari. App otomatis tahu
          senar mana yang lagi lu stem, terus dikasih tahu harus naikin apa
          turunin. Gak perlu milih-milih.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          {error}
        </div>
      )}

      {/* Pilih senar: klik = kunci, klik lagi = balik otomatis */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">
            {lockString === null
              ? "Mode OTOMATIS — app nebak senarnya. Kalau targetnya loncat-loncat, klik senar yang lagi lu stem."
              : `Dikunci ke senar ${VIOLIN_STRINGS[lockString].name} — app gak bakal pindah target.`}
          </span>
          {lockString !== null && (
            <button
              onClick={() => setLockString(null)}
              className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted hover:text-foreground"
            >
              ↺ balik otomatis
            </button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2">
        {VIOLIN_STRINGS.map((s, i) => {
          const isLocked = reading?.stringIdx === i;
          const isPinned = lockString === i;
          return (
            <button
              key={s.name}
              onClick={() => setLockString(isPinned ? null : i)}
              className={`rounded-xl border p-3 text-center transition-colors ${
                isPinned
                  ? inTune
                    ? "border-good bg-good/25 ring-2 ring-good"
                    : "border-accent bg-accent/25 ring-2 ring-accent"
                  : isLocked
                    ? inTune
                      ? "border-good bg-good/15"
                      : "border-accent bg-accent/15"
                    : "border-border-soft bg-surface hover:border-accent/60"
              }`}
            >
              <div
                className={`text-2xl font-bold ${
                  isLocked ? (inTune ? "text-good" : "text-accent-strong") : ""
                }`}
              >
                {s.name}
              </div>
              <div className="text-[11px] text-muted">
                {midiToFreq(s.midi).toFixed(1)} Hz
              </div>
              {/* span, bukan button — tombol di dalam tombol itu HTML gak sah */}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!active) playTone(midiToFreq(s.midi), 1.5);
                }}
                className={`mt-1 block text-[11px] text-accent-strong hover:underline ${
                  active ? "opacity-40" : ""
                }`}
                title="Matiin mic dulu — kalau nggak, suara speaker ikut ke-deteksi"
              >
                ▶ contoh
              </span>
              {isPinned && (
                <span className="mt-1 block text-[10px] font-semibold text-accent-strong">
                  🔒 dikunci
                </span>
              )}
            </button>
          );
        })}
        </div>
      </div>

      <div
        className={`rounded-2xl border bg-surface p-6 text-center transition-colors ${
          inTune ? "border-good animate-glow-good" : "border-border-soft"
        }`}
      >
        {/* Instruksi utama — gede, jelas */}
        <div className="min-h-28">
          {reading && str ? (
            tooFar ? (
              <>
                <div className="text-2xl font-bold text-bad">
                  Ini bukan nada senar kosong 🤔
                </div>
                <div className="mt-2 text-sm text-muted">
                  Kedeteksi {freqToNote(reading.freq).name} (
                  {reading.freq.toFixed(1)} Hz) —{" "}
                  {lockString !== null
                    ? `beda lebih dari satu nada penuh dari senar ${VIOLIN_STRINGS[lockString].name}. Kalau emang lagi masang senar baru, terus puter pasaknya; kalau nggak, cek jangan ada jari yang nempel.`
                    : "jauh banget dari semua senar. Lepas semua jari dari fingerboard, gesek senarnya doang."}
                </div>
              </>
            ) : inTune ? (
              <>
                <div className="animate-pop animate-hit relative inline-block rounded-full px-4 text-5xl font-bold text-good">
                  ✓ PAS!
                  {/* percikan kecil — muncul sekali tiap senar kena */}
                  {[
                    { sx: "-26px", sy: "-26px" },
                    { sx: "22px", sy: "-30px" },
                    { sx: "-32px", sy: "8px" },
                    { sx: "30px", sy: "6px" },
                  ].map((p, i) => (
                    <span
                      key={i}
                      className="spark absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-good"
                      style={
                        {
                          "--sx": p.sx,
                          "--sy": p.sy,
                          animationDelay: `${i * 60}ms`,
                        } as React.CSSProperties
                      }
                    />
                  ))}
                </div>
                <div className="mt-1 text-sm text-muted">
                  Senar {str.name} beres ({cents >= 0 ? "+" : ""}
                  {cents} cent). Lanjut senar berikutnya.
                </div>
              </>
            ) : (
              <>
                <div
                  className={`text-4xl font-bold ${
                    Math.abs(cents) <= FINE_TUNER_MAX
                      ? "text-accent-strong"
                      : "text-bad"
                  }`}
                >
                  {cents < 0 ? "⬆ NAIKIN — kencengin" : "⬇ TURUNIN — kendorin"}
                </div>
                <div className="mt-2 text-sm text-muted">
                  Senar <b className="text-foreground">{str.name}</b> meleset{" "}
                  <b className="text-foreground">
                    {cents > 0 ? "+" : ""}
                    {cents} cent
                  </b>{" "}
                  dari target {strFreq.toFixed(1)} Hz.
                </div>
                <div className="mt-1 text-xs text-muted">
                  {Math.abs(cents) <= FINE_TUNER_MAX
                    ? "🔩 Deket — pakai FINE TUNER (sekrup kecil di tailpiece), puter dikit-dikit."
                    : "🪵 Masih jauh — pakai PASAK: puter pelan sambil pasaknya didorong masuk ke pegbox. Sabar, senar bisa putus kalau kasar."}
                </div>
              </>
            )
          ) : (
            <div className="pt-8 text-muted">
              {active && pluck
                ? "Dengerin… petik satu senar, agak kuat."
                : active
                ? "Dengerin… gesek satu senar, panjang dan stabil."
                : "Mic belum nyala."}
            </div>
          )}
        </div>

        {/* Jarum — relatif ke target senar yang ke-lock */}
        <div className="relative mx-auto mt-4 h-3 w-full max-w-md rounded-full bg-surface-2">
          <div className="absolute left-1/2 top-[-6px] h-6 w-0.5 -translate-x-1/2 bg-muted" />
          <div className="absolute left-[45%] top-0 h-3 w-[10%] rounded-full bg-good/25" />
          {reading && !tooFar && (
            <div
              className={`absolute top-[-8px] h-7 w-1.5 -translate-x-1/2 rounded-full transition-all duration-300 ease-out ${
                inTune ? "bg-good" : "bg-accent-strong"
              }`}
              style={{
                left: `${50 + (Math.max(-50, Math.min(50, cents)) / 50) * 50}%`,
              }}
            />
          )}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted">
          <span>-50 cent · kerendahan</span>
          <span>0</span>
          <span>+50 cent · ketinggian</span>
        </div>

        {/* Info deteksi mentah — biar gak bingung "kok G4/G5" */}
        <div className="mt-3 min-h-5 text-xs text-muted">
          {reading && (
            <>
              kedeteksi: {freqToNote(reading.freq).name} ·{" "}
              {reading.freq.toFixed(1)} Hz — dibandingkan ke senar{" "}
              {str?.name} ({strFreq.toFixed(1)} Hz)
            </>
          )}
        </div>

        {/* Pelatih gesekan: kekecilan / pecah / cempreng */}
        {/* Kalau app lama gak nemu nada, dia ngalah sendiri — dikasih tahu ke
            user biar gak ngerasa alatnya diem-diem rusak. */}
        {active && relax > 0.15 && (
          <div className="mt-3 rounded-lg border border-accent/40 bg-accent/10 p-2.5 text-left text-xs">
            {/* dibulatin ke 10% — angka yang gerak tiap frame gak kebaca */}
            <b className="text-accent-strong">
              Lagi ngelonggarin deteksi ({Math.round(relax * 10) * 10}%)
            </b>{" "}
            — udah beberapa detik gesekan lu gak lolos saringan, jadi ambangnya
            diturunin otomatis.
            {rawFreq > 0 && (
              <>
                {" "}
                Nada mentah yang kebaca sekarang:{" "}
                <b className="text-foreground">{Math.round(rawFreq)} Hz</b>.
              </>
            )}{" "}
            Kalau tetap gak kebaca: deketin mic ke biola (20-30 cm), atau geser
            slider sensitivitas ke KANAN. Mau lihat angka mentahnya?{" "}
            <Link href="/mic" className="text-accent-strong underline">
              buka diagnosa
            </Link>
            .
          </div>
        )}

        <div className="mt-4">
          <BowFeedback
            active={active}
            freq={freq}
            volumeDb={volumeDb}
            peak={peak}
            noisy={noisy}
            calibrating={calibrating}
            noiseFloorDb={noiseFloorDb}
            reason={reason}
          />
        </div>

        <button
          onClick={active ? stop : start}
          className={`mt-4 rounded-full px-6 py-2.5 font-semibold transition-colors ${
            active
              ? "bg-surface-2 text-foreground hover:bg-border-soft"
              : "bg-accent text-background hover:bg-accent-strong"
          }`}
        >
          {active ? "■ Stop mic" : "🎤 Nyalain mic"}
        </button>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-muted">Cara nyetem:</span>
          {[
            { v: false, label: "🎻 Gesek", hint: "paling akurat" },
            { v: true, label: "🤏 Petik", hint: "cek cepat" },
          ].map((m) => (
            <button
              key={String(m.v)}
              onClick={() => setPluck(m.v)}
              className={`rounded-full px-4 py-1.5 text-xs transition-colors ${
                pluck === m.v
                  ? "bg-accent font-semibold text-background"
                  : "bg-surface-2 text-muted hover:text-foreground"
              }`}
            >
              {m.label}{" "}
              <span className="opacity-70">· {m.hint}</span>
            </button>
          ))}
        </div>
        <p className="mx-auto mt-2 max-w-md text-[11px] text-muted">
          {pluck
            ? "Mode petik: app nerima nada pendek. Baca angkanya SEGERA setelah metik — nada petikan turun sedikit sambil meredup, jadi bacaan di ekor bunyinya lebih rendah dari aslinya."
            : "Gesekan bikin nada bertahan stabil, jadi jarumnya gak nebak. Ini cara stem yang dipakai pemain — petik cuma buat cek cepat."}
        </p>
      </div>

      <SessionEval report={report} onClose={clear} />

      {/* Sensitivitas mic — kepakai di semua halaman yang dengerin biola */}
      <div className="rounded-xl border border-border-soft bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">
              🎚️ Sensitivitas mic: {sensitivityLabel(sensitivity)}
            </div>
            <div className="mt-0.5 max-w-md text-xs text-muted">
              App cuma baca nada yang jelas lebih keras dari suara latar
              ruangan. Kalau suara lain (kipas, TV, ngobrol) masih ke-deteksi,
              geser ke KIRI. Kalau gesekan lu gak kebaca padahal ruangan sepi,
              geser ke KANAN. Mau lihat alasan detailnya?{" "}
              <Link href="/mic" className="text-accent-strong underline">
                buka diagnosa mic
              </Link>
              .
              {active && noiseFloorDb > -100 && (
                <>
                  {" "}
                  Suara latar sekarang:{" "}
                  <b className="text-foreground">
                    {Math.round(noiseFloorDb)} dB
                  </b>
                  {noiseFloorDb > -45 && " — ruangannya lumayan berisik."}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(sensitivity * 100)}
              onChange={(e) => setSensitivity(Number(e.target.value) / 100)}
              className="w-40 accent-[var(--accent)]"
              aria-label="Sensitivitas mic"
            />
            {sensitivity !== DEFAULT_SENSITIVITY && (
              <button
                onClick={() => setSensitivity(DEFAULT_SENSITIVITY)}
                className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted hover:text-foreground"
              >
                normal
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Kalibrasi A4 — kepakai di semua halaman (intonasi, lagu, fingerboard) */}
      <div className="rounded-xl border border-border-soft bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">
              Kalibrasi acuan: A4 = {a4} Hz
            </div>
            <div className="mt-0.5 max-w-md text-xs text-muted">
              Biarin 440 kalau latihan sendiri. Naikin ke 442–443 kalau main
              bareng orkestra Eropa, turunin ke 415 buat musik barok. Semua
              halaman lain ikut angka ini.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={MIN_A4}
              max={MAX_A4}
              value={a4}
              onChange={(e) => setA4(Number(e.target.value))}
              className="w-40 accent-[var(--accent)]"
              aria-label="Kalibrasi A4"
            />
            {a4 !== DEFAULT_A4 && (
              <button
                onClick={() => setA4(DEFAULT_A4)}
                className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted hover:text-foreground"
              >
                balik 440
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border-soft bg-surface p-4 text-xs text-muted">
        💡 Urutan stem yang disarankan: A dulu, lalu D, G, terakhir E. Naikin =
        nada jadi lebih tinggi (senar makin kencang), turunin = sebaliknya.
        Tombol ▶ contoh cuma buat DENGAR nada targetnya — deteksi senar tetap
        otomatis, gak perlu mencet apa-apa.
      </div>
    </div>
  );
}
