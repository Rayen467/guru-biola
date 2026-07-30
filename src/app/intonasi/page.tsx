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
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">🎻 Latihan Intonasi</h1>
        <p className="mt-1 text-sm text-muted">
          App kasih nada target, lu mainkan. Tahan nadanya sampai batang hijau
          penuh = kena. Toleransi ±{TOLERANCE} cent.
        </p>
      </header>

      {/* Nada bermasalah — dikumpulin dari latihan lu sendiri, bukan tebakan.
          Ini yang bikin latihan besok beda dari latihan hari ini. */}
      {problems.length > 0 && problems[0].rate < 0.85 && (
        <div className="animate-fade-up rounded-xl border border-accent/40 bg-accent/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-accent-strong">
              🎯 Nada yang paling sering meleset
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
              className="press rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-background hover:bg-accent-strong"
            >
              Latih nada ini aja →
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {problems.slice(0, 4).map((n) => (
              <li
                key={n.midi}
                className="flex items-center gap-3 rounded-lg bg-surface-2 p-2 text-xs"
              >
                <span className="w-12 font-bold text-foreground">
                  {midiToName(n.midi)}
                </span>
                <span className="flex-1 text-muted">
                  kena {Math.round(n.rate * 100)}% dari {n.attempts} percobaan
                  {n.hits >= 3 && Math.abs(n.bias) > 6 && (
                    <>
                      {" · "}
                      {n.bias > 0
                        ? "cenderung KETINGGIAN — geser jari mundur"
                        : "cenderung KERENDAHAN — geser jari maju"}
                    </>
                  )}
                </span>
                <span className="font-mono text-muted">{fingerHint(n.midi)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
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
            className={`press rounded-full px-3 py-1.5 text-xs ${
              i === setIdx && !customSet
                ? "bg-accent font-semibold text-background"
                : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {s.label}
            {s.grade && (
              <span className="ml-1.5 opacity-70">· {s.grade}</span>
            )}
          </button>
        ))}
      </div>

      {/* Drone: nada dasar berkelanjutan. Nada meleset bakal berdenyut lawan
          drone — cara paling cepat ngelatih kuping yang belum kebentuk. */}
      <div className="rounded-xl border border-border-soft bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">
              🎵 Drone nada dasar
              {drone.midi !== null && (
                <span className="ml-2 text-accent-strong">
                  bunyi: {midiToName(drone.midi)}
                </span>
              )}
            </div>
            <div className="mt-0.5 max-w-md text-xs text-muted">
              Nada acuan yang dibunyikan terus. Kalau nada lu meleset dikit,
              bakal kedengeran &quot;berdenyut&quot; lawan drone — jauh lebih
              jelas daripada ngandelin jarum. Acuan A4 = {a4} Hz.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => drone.toggle(set.tonic)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                drone.midi === set.tonic
                  ? "bg-accent text-background"
                  : "bg-surface-2 text-foreground hover:bg-border-soft"
              }`}
            >
              {drone.midi === set.tonic ? "■ stop" : "▶"} tonik{" "}
              {midiToName(set.tonic)}
            </button>
            {[55, 62, 69, 76].map((m) => (
              <button
                key={m}
                onClick={() => drone.toggle(m)}
                className={`rounded-full px-2.5 py-1.5 text-xs transition-colors ${
                  drone.midi === m
                    ? "bg-accent font-semibold text-background"
                    : "bg-surface-2 text-muted hover:text-foreground"
                }`}
              >
                {midiToName(m)}
              </button>
            ))}
            <input
              type="range"
              min={0}
              max={60}
              value={Math.round(drone.volume * 100)}
              onChange={(e) => drone.setVolume(Number(e.target.value) / 100)}
              className="w-24 accent-[var(--accent)]"
              aria-label="Volume drone"
            />
          </div>
        </div>
        {drone.playing && active && (
          <div className="mt-2 rounded-lg bg-surface-2 p-2 text-xs text-muted">
            🎧 Pakai headphone kalau bisa. Lewat speaker, mic ikut denger
            drone-nya — nada drone otomatis diabaikan penilaian, tapi kalau nada
            targetnya sama persis dengan drone, matiin dulu drone-nya.
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          {error}
        </div>
      )}

      <div
        className={`rounded-2xl border p-6 text-center transition-colors ${
          flash === "hit"
            ? "border-good bg-good/10"
            : "border-border-soft bg-surface"
        }`}
      >
        <div className="mb-2 flex justify-center">
          <LabelSwitch compact />
        </div>
        <div className="text-xs uppercase tracking-wide text-muted">
          Nada target ({noteIdx + 1}/{set.midis.length}) — {set.hint}
        </div>
        <div className="my-3 text-7xl font-bold text-accent-strong">
          {labelFor(targetMidi, labelMode)}
        </div>
        <div className="text-sm text-muted">
          🖐️ {fingerHint(targetMidi)} · target {targetFreq.toFixed(1)} Hz
        </div>
        <button
          onClick={() => playTone(targetFreq, 1.5)}
          disabled={active}
          className="mt-2 rounded-full bg-surface-2 px-4 py-1.5 text-sm text-foreground transition-colors hover:bg-border-soft disabled:opacity-50"
          title="Matiin mic dulu biar suara speaker gak ke-deteksi"
        >
          ▶ Dengar contoh
        </button>

        {/* Meteran cent relatif target */}
        <div className="relative mx-auto mt-6 h-3 w-full max-w-md rounded-full bg-surface-2">
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

        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            onClick={active ? stop : start}
            className={`rounded-full px-6 py-2.5 font-semibold transition-colors ${
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
              className="rounded-full bg-surface-2 px-4 py-2.5 text-sm text-muted transition-colors hover:text-foreground"
            >
              Lewati nada ini →
            </button>
          )}
        </div>

        <div className="mt-4 text-sm text-muted">
          Sesi ini: <span className="font-semibold text-good">{hits} kena</span>{" "}
          dari {attempts} percobaan
        </div>
      </div>

      <SessionEval report={report} onClose={clear} />

      <div className="space-y-2 rounded-xl border border-border-soft bg-surface p-4 text-xs text-muted">
        <p>
          💡 <b className="text-foreground">Arah jari:</b> makin DEKET jembatan
          (maju) = makin TINGGI nadanya. Geser itu milimeteran, bukan senti.
          Kalau meleset terus di arah yang sama, tandain posisi jarinya pakai
          tape.
        </p>
        <p>
          🎻 <b className="text-foreground">Gesekan yang bener:</b> bow nempel
          senar dengan berat lengan (bukan diteken), kecepatan santai ±1 detik
          per arah, jalur bow di tengah antara jembatan dan fingerboard, lurus
          sejajar jembatan. Kekecilan = tambah berat + niatin gesekannya;
          cempreng = pelanin dan longgarin tekanan.
        </p>
      </div>
    </div>
  );
}
