"use client";

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
  const { freq, clarity, volumeDb, peak, active, error, start, stop } =
    usePitch();
  const a4 = useA4();
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
        const idx =
          prev !== null &&
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
  }, [freq, clarity, active, a4]);

  const str = reading ? VIOLIN_STRINGS[reading.stringIdx] : null;
  const strFreq = str ? midiToFreq(str.midi) : 0;
  const cents = reading?.cents ?? 0;
  const inTune = reading !== null && Math.abs(cents) <= IN_TUNE;
  const tooFar = reading !== null && Math.abs(cents) > FAR_CENTS;

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

      {/* Kartu 4 senar — yang ke-lock nyala otomatis */}
      <div className="grid grid-cols-4 gap-2">
        {VIOLIN_STRINGS.map((s, i) => {
          const isLocked = reading?.stringIdx === i;
          return (
            <div
              key={s.name}
              className={`rounded-xl border p-3 text-center transition-colors ${
                isLocked
                  ? inTune
                    ? "border-good bg-good/15"
                    : "border-accent bg-accent/15"
                  : "border-border-soft bg-surface"
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
              <button
                onClick={() => playTone(midiToFreq(s.midi), 1.5)}
                disabled={active}
                className="mt-1 text-[11px] text-accent-strong hover:underline disabled:opacity-40"
                title="Matiin mic dulu — kalau nggak, suara speaker ikut ke-deteksi"
              >
                ▶ contoh
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border-soft bg-surface p-6 text-center">
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
                  {reading.freq.toFixed(1)} Hz) — jauh banget dari semua senar.
                  Lepas semua jari dari fingerboard, gesek senarnya doang.
                </div>
              </>
            ) : inTune ? (
              <>
                <div className="text-5xl font-bold text-good">✓ PAS!</div>
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
              {active
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
        <div className="mt-4">
          <BowFeedback
            active={active}
            freq={freq}
            volumeDb={volumeDb}
            peak={peak}
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
