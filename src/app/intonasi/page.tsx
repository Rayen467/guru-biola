"use client";

import { useEffect, useRef, useState } from "react";
import { usePitch } from "@/lib/usePitch";
import { useDrone } from "@/lib/drone";
import { useSensitivity } from "@/lib/micSettings";
import {
  centsBetween,
  freqToNote,
  midiToFreq,
  midiToName,
  useA4,
} from "@/lib/notes";
import { playTone } from "@/lib/tone";
import {
  loadProgress,
  logNoteAttempt,
  problemNotes,
  updateProgress,
  type NoteProblem,
} from "@/lib/progress";
import { fingerHint } from "@/lib/songs";
import BowFeedback from "@/components/BowFeedback";
import LabelSwitch from "@/components/LabelSwitch";
import { labelFor, useLabelMode } from "@/lib/noteLabel";
import SessionEval from "@/components/SessionEval";
import { useSessionEval } from "@/lib/sessionEval";

// Set latihan: nama + deretan MIDI note.
// `tonic` = nada dasar buat drone. `grade` = patokan silabus resmi kalau ada.
interface PracticeSet {
  id: string;
  label: string;
  hint: string;
  midis: number[];
  tonic: number;
  grade?: string;
}

const SETS: PracticeSet[] = [
  {
    id: "a-string",
    label: "Senar A — jari 1-2-3",
    hint: "A kosong, B (jari 1), C# (jari 2), D (jari 3)",
    midis: [69, 71, 73, 74],
    tonic: 69,
  },
  {
    id: "e-string",
    label: "Senar E — jari 1-2-3",
    hint: "E kosong, F# (jari 1), G# (jari 2), A (jari 3)",
    midis: [76, 78, 80, 81],
    tonic: 76,
  },
  {
    id: "d-string",
    label: "Senar D — jari 1-2-3",
    hint: "D kosong, E (jari 1), F# (jari 2), G (jari 3)",
    midis: [62, 64, 66, 67],
    tonic: 62,
  },
  {
    id: "g-string",
    label: "Senar G — jari 1-2-3",
    hint: "G kosong, A (jari 1), B (jari 2), C (jari 3)",
    midis: [55, 57, 59, 60],
    tonic: 55,
  },
  {
    id: "a-major",
    label: "Tangga nada A mayor (1 oktaf)",
    hint: "Mulai senar A kosong, pindah ke senar E di tengah",
    midis: [69, 71, 73, 74, 76, 78, 80, 81],
    tonic: 69,
    grade: "ABRSM Grade 1",
  },
  {
    id: "d-major",
    label: "Tangga nada D mayor (1 oktaf)",
    hint: "Mulai senar D kosong",
    midis: [62, 64, 66, 67, 69, 71, 73, 74],
    tonic: 62,
    grade: "ABRSM Grade 1",
  },
  {
    id: "a-arpeggio",
    label: "Arpeggio A mayor (1 oktaf)",
    hint: "A – C# – E – A. Lompat jari, bukan nada tetangga",
    midis: [69, 73, 76, 81],
    tonic: 69,
    grade: "ABRSM Grade 1",
  },
  {
    id: "d-arpeggio",
    label: "Arpeggio D mayor (1 oktaf)",
    hint: "D – F# – A – D. Pindah senar di tengah",
    midis: [62, 66, 69, 74],
    tonic: 62,
    grade: "ABRSM Grade 1",
  },
  {
    id: "g-major",
    label: "Tangga nada G mayor (2 oktaf)",
    hint: "Tangga nada terpanjang — pelan-pelan",
    midis: [55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 73, 74, 76, 78, 80, 79],
    tonic: 55,
  },
  {
    id: "g-arpeggio",
    label: "Arpeggio G mayor (2 oktaf)",
    hint: "G – B – D – G – B – D – G. Lewat tiga senar",
    midis: [55, 59, 62, 67, 71, 74, 79],
    tonic: 55,
  },
];

const TOLERANCE = 15; // cent
const HOLD_MS = 900; // harus nahan nada segini lama
const FAR_CENTS = 100; // lebih dari ini = kemungkinan salah senar/jari, bukan geser dikit

const OPEN_STRING_MIDIS = [55, 62, 69, 76];

export default function IntonasiPage() {
  const sensitivity = useSensitivity();
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
    start,
    stop,
  } = usePitch({ sensitivity });
  const drone = useDrone();
  const a4 = useA4();
  const labelMode = useLabelMode();

  useEffect(() => {
    setProblems(problemNotes(loadProgress()));
  }, []);
  const { report, clear } = useSessionEval({
    active,
    freq,
    volumeDb,
    peak,
    reason,
  });
  const [setIdx, setSetIdx] = useState(0);
  const [noteIdx, setNoteIdx] = useState(0);
  // Set dadakan berisi nada-nada yang paling sering meleset.
  const [customSet, setCustomSet] = useState<PracticeSet | null>(null);
  const [problems, setProblems] = useState<NoteProblem[]>([]);
  const [hits, setHits] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [flash, setFlash] = useState<"hit" | null>(null);
  const [smooth, setSmooth] = useState<number | null>(null);
  const holdStart = useRef<number | null>(null);
  const [holdPct, setHoldPct] = useState(0);
  const hist = useRef<number[]>([]);
  const lastValidAt = useRef(0);

  const set = customSet ?? SETS[setIdx];
  const targetMidi = set.midis[noteIdx];
  const targetFreq = midiToFreq(targetMidi);
  const isOpenString = OPEN_STRING_MIDIS.includes(targetMidi);

  // Smoothing: median 5 bacaan terakhir — jarum kalem, akurasi penilaian naik,
  // blip salah-deteksi sesaat kebuang.
  useEffect(() => {
    if (!active) {
      hist.current = [];
      setSmooth(null);
      return;
    }
    const now = performance.now();
    if (freq !== null) {
      hist.current.push(freq);
      if (hist.current.length > 5) hist.current.shift();
      lastValidAt.current = now;
      if (hist.current.length >= 3) {
        const sorted = [...hist.current].sort((a, b) => a - b);
        setSmooth(sorted[Math.floor(sorted.length / 2)]);
      }
    } else if (now - lastValidAt.current > 500) {
      hist.current = [];
      setSmooth(null);
    }
  }, [freq, clarity, active]);

  // selisih cent terhadap TARGET (bukan nada terdekat)
  const cents =
    smooth !== null ? Math.round(centsBetween(smooth, targetFreq)) : null;

  // Drone lewat speaker bakal ikut kedengeran mic. Kalau yang kebaca persis
  // nada drone-nya padahal targetnya nada lain, itu suara drone — bukan
  // gesekan lu. Jangan dinilai.
  const droneEcho =
    drone.midi !== null &&
    drone.midi !== targetMidi &&
    smooth !== null &&
    Math.abs(centsBetween(smooth, midiToFreq(drone.midi))) < 10;

  const onTarget = !droneEcho && cents !== null && Math.abs(cents) <= TOLERANCE;

  useEffect(() => {
    if (!active) {
      holdStart.current = null;
      setHoldPct(0);
      return;
    }
    if (onTarget) {
      if (holdStart.current === null) holdStart.current = performance.now();
      const elapsed = performance.now() - holdStart.current;
      setHoldPct(Math.min(100, (elapsed / HOLD_MS) * 100));
      if (elapsed >= HOLD_MS) {
        // KENA!
        holdStart.current = null;
        setHoldPct(0);
        setFlash("hit");
        setTimeout(() => setFlash(null), 600);
        setHits((h) => h + 1);
        setAttempts((a) => a + 1);
        updateProgress((p) => {
          p.intonation.hits += 1;
          p.intonation.attempts += 1;
        });
        // Simpan per nada + arah melesetnya, biar app tahu nada mana yang
        // jadi langganan masalah — bukan cuma persentase gabungan.
        logNoteAttempt(targetMidi, true, cents ?? 0);
        setProblems(problemNotes(loadProgress()));
        setNoteIdx((i) => (i + 1) % set.midis.length);
      }
    } else {
      holdStart.current = null;
      setHoldPct(0);
    }
  }, [smooth, cents, onTarget, active, set.midis.length]);

  const skip = () => {
    setAttempts((a) => a + 1);
    updateProgress((p) => {
      p.intonation.attempts += 1;
    });
    // Dilewati = gagal buat nada itu. Arah melesetnya gak dicatat: pas gagal,
    // yang kebaca bisa aja senar lain, jadi angkanya gak bisa dipercaya.
    logNoteAttempt(targetMidi, false);
    setProblems(problemNotes(loadProgress()));
    holdStart.current = null;
    setHoldPct(0);
    setNoteIdx((i) => (i + 1) % set.midis.length);
  };

  return (
    // Tata letak bento: satu layar, tanpa ruang terbuang. Kotak besar buat yang
    // dipelototin sambil main (nada target + jarum), kotak kecil buat setelan
    // yang cuma sesekali disentuh. Di HP semuanya jadi satu kolom.
    <div className="mx-auto max-w-5xl space-y-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">🎻 Latihan Intonasi</h1>
        <p className="text-xs text-muted">
          Tahan nada sampai batang hijau penuh = kena · toleransi ±{TOLERANCE}{" "}
          cent
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-3">
      {/* Nada bermasalah — dikumpulin dari latihan lu sendiri, bukan tebakan.
          Ini yang bikin latihan besok beda dari latihan hari ini. */}
      {problems.length > 0 && problems[0].rate < 0.85 && (
        <div className="animate-fade-up order-4 rounded-xl border border-accent/40 bg-accent/10 p-3 lg:order-none lg:col-span-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-accent-strong">
              🎯 Sering meleset
            </h2>
            <button
              onClick={() => {
                const weak = problems.filter((n) => n.rate < 0.85).slice(0, 5);
                if (weak.length === 0) return;
                setCustomSet({
                  id: "problem",
                  label: "Nada bermasalah lu",
                  hint: "Diambil dari catatan latihan lu sendiri",
                  midis: weak.map((n) => n.midi).sort((a, b) => a - b),
                  tonic: weak[0].midi,
                });
                setNoteIdx(0);
                holdStart.current = null;
                setHoldPct(0);
              }}
              className="press rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-background hover:bg-accent-strong"
            >
              Latih ini →
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {problems.slice(0, 4).map((n) => (
              <li
                key={n.midi}
                className="flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5 text-[11px]"
              >
                <span className="w-9 font-bold text-foreground">
                  {labelFor(n.midi, labelMode)}
                </span>
                <span className="flex-1 text-muted">
                  {Math.round(n.rate * 100)}% kena
                  {n.hits >= 3 && Math.abs(n.bias) > 6 && (
                    <> · {n.bias > 0 ? "ketinggian" : "kerendahan"}</>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pilihan set latihan */}
      <div className="order-3 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-border-soft bg-surface p-3 lg:order-none lg:col-span-1">
        {customSet && (
          <button
            onClick={() => {
              setCustomSet(null);
              setNoteIdx(0);
            }}
            className="press rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-background"
          >
            🎯 {customSet.label} · klik buat keluar
          </button>
        )}
        {SETS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => {
              setCustomSet(null);
              setSetIdx(i);
              setNoteIdx(0);
              holdStart.current = null;
              setHoldPct(0);
            }}
            className={`press rounded-full px-2.5 py-1 text-[11px] ${
              i === setIdx && !customSet
                ? "bg-accent font-semibold text-background"
                : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Drone: nada dasar berkelanjutan. Nada meleset bakal berdenyut lawan
          drone — cara paling cepat ngelatih kuping yang belum kebentuk. */}
      <div className="order-5 rounded-xl border border-border-soft bg-surface p-3 lg:order-none lg:col-span-1">
        <div className="space-y-2">
          <div>
            <div className="text-xs font-medium">
              🎵 Drone nada dasar
              {drone.midi !== null && (
                <span className="ml-2 text-accent-strong">
                  bunyi {labelFor(drone.midi, labelMode)}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">
              Nada acuan yang dibunyiin terus. Nada lu yang meleset bakal
              kedengeran berdenyut lawan drone — jauh lebih jelas daripada
              ngandelin jarum. A4 = {a4} Hz.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => drone.toggle(set.tonic)}
              className={`press rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                drone.midi === set.tonic
                  ? "bg-accent text-background"
                  : "bg-surface-2 text-foreground hover:bg-border-soft"
              }`}
            >
              {drone.midi === set.tonic ? "■" : "▶"} tonik{" "}
              {labelFor(set.tonic, labelMode)}
            </button>
            {[55, 62, 69, 76].map((m) => (
              <button
                key={m}
                onClick={() => drone.toggle(m)}
                className={`press rounded-full px-2 py-1 text-[11px] ${
                  drone.midi === m
                    ? "bg-accent font-semibold text-background"
                    : "bg-surface-2 text-muted hover:text-foreground"
                }`}
              >
                {labelFor(m, labelMode)}
              </button>
            ))}
            <input
              type="range"
              min={0}
              max={60}
              value={Math.round(drone.volume * 100)}
              onChange={(e) => drone.setVolume(Number(e.target.value) / 100)}
              className="w-20 accent-[var(--accent)]"
              aria-label="Volume drone"
            />
          </div>
          {drone.playing && active && (
            <div className="rounded-lg bg-surface-2 p-2 text-[11px] text-muted">
              🎧 Lewat speaker, mic ikut denger drone-nya — nadanya otomatis
              diabaikan. Tapi kalau nada targetnya sama persis dengan drone,
              matiin dulu.
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="order-1 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad lg:order-none lg:col-span-3">
          {error}
        </div>
      )}

      {/* Kotak utama — ini yang dipelototin sambil main, jadi paling besar */}
      <div
        className={`order-2 rounded-2xl border p-4 text-center transition-colors lg:order-none lg:col-span-2 lg:row-span-2 ${
          flash === "hit"
            ? "border-good bg-good/10 animate-glow-good"
            : "border-border-soft bg-surface"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted">
            Nada {noteIdx + 1}/{set.midis.length}
          </span>
          <LabelSwitch compact />
        </div>

        {/* Nada target: tetap paling besar di halaman — ini yang dibaca dari
            jarak main, sambil biola nempel di bahu. */}
        <div className="my-1 text-7xl font-bold leading-none text-accent-strong">
          {labelFor(targetMidi, labelMode)}
        </div>
        <div className="text-xs text-muted">
          🖐️ {fingerHint(targetMidi)} · {targetFreq.toFixed(1)} Hz ·{" "}
          <button
            onClick={() => playTone(targetFreq, 1.5)}
            disabled={active}
            className="press underline-offset-2 hover:underline disabled:opacity-50"
            title="Matiin mic dulu biar suara speaker gak ke-deteksi"
          >
            ▶ dengar contoh
          </button>
        </div>
        <div className="mt-0.5 text-[11px] text-muted">{set.hint}</div>

        {/* Meteran cent relatif target */}
        <div className="relative mx-auto mt-4 h-3 w-full max-w-md rounded-full bg-surface-2">
          <div className="absolute left-1/2 top-[-6px] h-6 w-0.5 -translate-x-1/2 bg-muted" />
          <div
            className="absolute top-0 h-3 rounded-full bg-good/25"
            style={{
              left: `${50 - (TOLERANCE / 50) * 50}%`,
              width: `${(TOLERANCE / 50) * 100}%`,
            }}
          />
          {cents !== null && Math.abs(cents) <= FAR_CENTS && (
            <div
              className={`absolute top-[-8px] h-7 w-1.5 -translate-x-1/2 rounded-full transition-all duration-200 ease-out ${
                onTarget ? "bg-good" : "bg-bad"
              }`}
              style={{
                left: `${50 + (Math.max(-50, Math.min(50, cents)) / 50) * 50}%`,
              }}
            />
          )}
        </div>

        {/* Instruksi arah — gede & eksplisit */}
        <div className="mt-3 min-h-14">
          {droneEcho ? (
            <div className="pt-2 text-sm text-muted">
              🎵 Yang kebaca ini suara drone-nya sendiri — gesek nada targetnya.
            </div>
          ) : cents === null ? (
            <div className="pt-2 text-sm text-muted">
              {active ? "Dengerin… mainkan nadanya." : "Mic belum nyala."}
            </div>
          ) : onTarget ? (
            <div className="animate-pop text-2xl font-bold text-good">
              TAHAN… 🟢
            </div>
          ) : Math.abs(cents) > FAR_CENTS ? (
            <div className="text-sm text-bad">
              Jauh banget ({cents > 0 ? "+" : ""}
              {cents} cent) — kedeteksi{" "}
              <b>{smooth !== null ? freqToNote(smooth).name : ""}</b>. Cek:
              senar bener? jari bener? ({fingerHint(targetMidi)})
            </div>
          ) : cents > 0 ? (
            <>
              <div className="text-2xl font-bold text-accent-strong">
                ⬇ KETINGGIAN +{cents} cent
              </div>
              <div className="text-xs text-muted">
                {isOpenString
                  ? "Senar kosongnya ketinggian — kendorin dikit (stem di /tuner)."
                  : "Geser jari MUNDUR dikit — ke arah scroll (kepala biola)."}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-accent-strong">
                ⬆ KERENDAHAN {cents} cent
              </div>
              <div className="text-xs text-muted">
                {isOpenString
                  ? "Senar kosongnya kerendahan — kencengin dikit (stem di /tuner)."
                  : "Geser jari MAJU dikit — ke arah badan biola (jembatan)."}
              </div>
            </>
          )}
        </div>

        {/* Progress tahan nada */}
        <div className="mx-auto mt-3 h-2 w-48 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full bg-good transition-all duration-100"
            style={{ width: `${holdPct}%` }}
          />
        </div>

        {/* Pelatih gesekan: suara kekecilan/kegedean/cempreng + cara benerin */}
        <div className="mt-3">
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

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={active ? stop : start}
            className={`press rounded-full px-5 py-2 font-semibold ${
              active
                ? "bg-surface-2 text-foreground hover:bg-border-soft"
                : "bg-accent text-background hover:bg-accent-strong"
            }`}
          >
            {active ? "■ Stop" : "🎤 Mulai latihan"}
          </button>
          {active && (
            <button
              onClick={skip}
              className="press rounded-full bg-surface-2 px-3 py-2 text-xs text-muted hover:text-foreground"
            >
              Lewati →
            </button>
          )}
          <span className="text-xs text-muted">
            <b className="text-good">{hits} kena</b> / {attempts}
          </span>
        </div>
      </div>

      {/* Tips: dilipat, karena cuma dibaca sekali di awal — bukan tiap latihan */}
      <details className="order-6 rounded-xl border border-border-soft bg-surface p-3 text-[11px] text-muted lg:order-none lg:col-span-1">
        <summary className="cursor-pointer text-xs font-medium text-foreground">
          💡 Cara benerin nada & gesekan
        </summary>
        <p className="mt-2">
          <b className="text-foreground">Arah jari:</b> makin deket jembatan
          (maju) = makin tinggi. Gesernya milimeteran, bukan senti. Kalau meleset
          terus ke arah yang sama, tandain posisinya pakai tape.
        </p>
        <p className="mt-2">
          <b className="text-foreground">Gesekan bener:</b> bow nempel senar pakai
          berat lengan (bukan diteken), ±1 detik per arah, jalur bow di tengah
          antara jembatan dan fingerboard. Kekecilan = tambah berat; cempreng =
          pelanin dan longgarin tekanan.
        </p>
      </details>

      <div className="order-7 lg:order-none lg:col-span-3">
        <SessionEval report={report} onClose={clear} />
      </div>
      </div>
    </div>
  );
}
