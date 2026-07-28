"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePitch } from "@/lib/usePitch";
import { centsBetween, midiToFreq, midiToName } from "@/lib/notes";
import { playTone } from "@/lib/tone";
import { useSensitivity } from "@/lib/micSettings";
import { fingerHint } from "@/lib/songs";
import BowFeedback from "@/components/BowFeedback";
import SessionEval from "@/components/SessionEval";
import { useSessionEval } from "@/lib/sessionEval";

// Baca not balok — sight-reading.
//
// Ini komponen ujian yang selama ini gak ada alatnya di app (lihat /silabus:
// ABRSM & Trinity dua-duanya nguji baca langsung). Bedanya sama menu intonasi:
// di sana nadanya ditulis huruf, di sini lu harus BACA posisinya di paranada —
// keahlian yang beda dan wajib dilatih dari awal biar gak kejebak hafalan.

const TOLERANCE = 30; // cent
const HOLD_MS = 400;
const WRONG_MS = 2500; // salah nada selama ini = dikasih tahu jawabannya

interface Level {
  id: string;
  label: string;
  hint: string;
  midis: number[];
}

const LEVELS: Level[] = [
  {
    id: "a-string",
    label: "Senar A (posisi 1)",
    hint: "A – B – C♯ – D. Empat nada dulu, sampai hafal bentuknya di paranada.",
    midis: [69, 71, 73, 74],
  },
  {
    id: "d-a",
    label: "Senar D + A",
    hint: "Satu oktaf D mayor. Perhatikan mana yang di garis, mana di spasi.",
    midis: [62, 64, 66, 67, 69, 71, 73, 74],
  },
  {
    id: "e-string",
    label: "Senar E",
    hint: "Wilayah atas — mulai butuh garis bantu (ledger line).",
    midis: [76, 78, 80, 81, 83],
  },
  {
    id: "g-string",
    label: "Senar G (garis bantu bawah)",
    hint: "Di bawah paranada. Ini yang paling sering bikin pemula bengong.",
    midis: [55, 57, 59, 60, 62],
  },
  {
    id: "all",
    label: "Semua senar, posisi 1",
    hint: "Campur semua. Target ujian Grade 1.",
    midis: [55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 73, 74, 76, 78, 80, 81],
  },
];

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

// Posisi not di paranada dihitung dalam "langkah diatonis" (C=0, D=1, …),
// bukan semitone: C♯ dan C duduk di garis yang sama, bedanya cuma tanda ♯.
function staffStep(midi: number): { step: number; sharp: boolean } {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const name = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  const letter = name[0];
  const sharp = name.length > 1;
  return { step: LETTERS.indexOf(letter) + 7 * octave, sharp };
}

const BOTTOM_LINE = staffStep(64).step; // E4 = garis paling bawah kunci G
const TOP_LINE = staffStep(77).step; // F5 = garis paling atas

export default function NotasiPage() {
  const sensitivity = useSensitivity();
  const {
    freq,
    volumeDb,
    peak,
    noisy,
    calibrating,
    noiseFloorDb,
    reason,
    active,
    error,
    start,
    stop,
  } = usePitch({ sensitivity, stableMs: 140 });

  const { report, clear } = useSessionEval({
    active,
    freq,
    volumeDb,
    peak,
    reason,
  });
  const [levelIdx, setLevelIdx] = useState(0);
  const [queue, setQueue] = useState<number[]>([]);
  const [correct, setCorrect] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [holdPct, setHoldPct] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [flash, setFlash] = useState<"hit" | null>(null);

  const holdStart = useRef<number | null>(null);
  const wrongStart = useRef<number | null>(null);
  const level = LEVELS[levelIdx];

  const draw = useCallback((lv: Level, avoid?: number) => {
    const pool = lv.midis.filter((m) => m !== avoid);
    return pool[Math.floor(Math.random() * pool.length)];
  }, []);

  const refill = useCallback(
    (lv: Level) => {
      const list: number[] = [];
      for (let i = 0; i < 4; i++) {
        list.push(draw(lv, list[list.length - 1]));
      }
      setQueue(list);
    },
    [draw]
  );

  useEffect(() => {
    refill(LEVELS[levelIdx]);
    setHoldPct(0);
    setReveal(false);
    holdStart.current = null;
    wrongStart.current = null;
  }, [levelIdx, refill]);

  const target = queue[0];
  const targetFreq = target ? midiToFreq(target) : 0;
  const cents =
    freq !== null && target ? Math.round(centsBetween(freq, targetFreq)) : null;
  const onTarget = cents !== null && Math.abs(cents) <= TOLERANCE;

  const next = useCallback(
    (wasCorrect: boolean) => {
      setAttempts((a) => a + 1);
      if (wasCorrect) {
        setCorrect((c) => c + 1);
        setStreak((s) => {
          const n = s + 1;
          setBestStreak((b) => Math.max(b, n));
          return n;
        });
      } else {
        setStreak(0);
      }
      holdStart.current = null;
      wrongStart.current = null;
      setHoldPct(0);
      setReveal(false);
      setQueue((q) => {
        const rest = q.slice(1);
        return [...rest, draw(LEVELS[levelIdx], rest[rest.length - 1])];
      });
    },
    [draw, levelIdx]
  );

  useEffect(() => {
    if (!active || !target) return;
    const now = performance.now();

    if (onTarget) {
      wrongStart.current = null;
      if (holdStart.current === null) holdStart.current = now;
      const held = now - holdStart.current;
      setHoldPct(Math.min(100, (held / HOLD_MS) * 100));
      if (held >= HOLD_MS) {
        setFlash("hit");
        setTimeout(() => setFlash(null), 400);
        next(true);
      }
    } else {
      holdStart.current = null;
      setHoldPct(0);
      if (freq !== null) {
        if (wrongStart.current === null) wrongStart.current = now;
        else if (now - wrongStart.current > WRONG_MS) setReveal(true);
      }
    }
  }, [freq, cents, onTarget, active, target, next]);

  const acc = attempts > 0 ? Math.round((correct / attempts) * 100) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">🎼 Baca Not Balok</h1>
        <p className="mt-1 text-sm text-muted">
          Not muncul di paranada, lu mainkan di biola. Gak ada nama nadanya —
          itu intinya. Ini komponen yang diuji ABRSM & Trinity, dan yang bikin
          lu bisa main lagu baru tanpa nunggu ada yang nyontohin.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {LEVELS.map((lv, i) => (
          <button
            key={lv.id}
            onClick={() => setLevelIdx(i)}
            className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
              i === levelIdx
                ? "bg-accent font-semibold text-background"
                : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {lv.label}
          </button>
        ))}
      </div>
      <p className="-mt-3 text-xs text-muted">{level.hint}</p>

      {error && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          {error}
        </div>
      )}

      <div
        className={`rounded-2xl border p-6 transition-colors ${
          flash === "hit" ? "border-good bg-good/10" : "border-border-soft bg-surface"
        }`}
      >
        <Staff current={target} upcoming={queue.slice(1, 4)} />

        <div className="mt-4 text-center">
          {reveal ? (
            <div className="text-sm text-bad">
              Itu <b>{midiToName(target)}</b> — {fingerHint(target)}.{" "}
              <button
                onClick={() => next(false)}
                className="underline hover:text-foreground"
              >
                lewati →
              </button>
            </div>
          ) : cents === null ? (
            <div className="text-sm text-muted">
              {active ? "Mainkan notnya…" : "Mic belum nyala."}
            </div>
          ) : onTarget ? (
            <div className="text-xl font-bold text-good">TAHAN… 🟢</div>
          ) : (
            <div className="text-sm text-accent-strong">
              Belum pas — {cents > 0 ? "ketinggian" : "kerendahan"}{" "}
              {Math.abs(cents)} cent
            </div>
          )}
        </div>

        <div className="mx-auto mt-3 h-2 w-48 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full bg-good transition-all duration-100"
            style={{ width: `${holdPct}%` }}
          />
        </div>

        {showHint && target && (
          <div className="mt-3 text-center text-xs text-muted">
            🖐️ {fingerHint(target)}
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

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
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
          <button
            onClick={() => playTone(targetFreq, 1.2)}
            disabled={active}
            className="rounded-full bg-surface-2 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-border-soft disabled:opacity-40"
            title="Matiin mic dulu biar suara speaker gak ke-deteksi"
          >
            ▶ Dengar
          </button>
          <button
            onClick={() => next(false)}
            className="rounded-full bg-surface-2 px-4 py-2.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            Lewati →
          </button>
          <button
            onClick={() => setShowHint((h) => !h)}
            className={`rounded-full px-4 py-2.5 text-sm transition-colors ${
              showHint
                ? "bg-surface-2 text-muted hover:text-foreground"
                : "bg-accent/20 text-accent-strong"
            }`}
          >
            {showHint ? "Sembunyikan bantuan jari" : "Bantuan jari: mati"}
          </button>
        </div>
      </div>

      <SessionEval report={report} onClose={clear} />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Benar" value={`${correct} / ${attempts}`} />
        <Stat label="Akurasi" value={acc === null ? "—" : `${acc}%`} />
        <Stat label="Streak terbaik" value={String(bestStreak)} />
      </div>

      <div className="space-y-2 rounded-xl border border-border-soft bg-surface p-4 text-xs text-muted">
        <p>
          📖 <b className="text-foreground">Cara baca cepat:</b> jangan eja
          &quot;garis satu, spasi dua…&quot;. Hafal DUA patokan aja dulu — not
          di garis bawah = E (senar D, jari 2), not di garis atas = F. Sisanya
          dihitung dari situ. Lama-lama jadi refleks bentuk, bukan hitungan.
        </p>
        <p>
          🎯 <b className="text-foreground">Matikan bantuan jari</b> begitu
          akurasi lu tembus 80%. Selama masih keliatan, otak lu baca tulisan
          jari — bukan baca not.
        </p>
        <p>
          ♯ Tanda kres di depan not berlaku buat not itu. Di ujian beneran,
          tanda mula (key signature) ditaruh di awal baris — nanti nyusul di
          level lanjut.
        </p>
      </div>
    </div>
  );
}

// Paranada kunci G. Not digambar manual pakai SVG biar gak perlu font musik
// (glyph musik sering gak ada di Windows dan malah muncul kotak).
function Staff({ current, upcoming }: { current?: number; upcoming: number[] }) {
  const W = 560;
  const H = 220;
  const gap = 16; // jarak antar garis paranada
  const half = gap / 2; // satu langkah diatonis
  const bottomY = H / 2 + gap * 2;

  const yOf = (step: number) => bottomY - (step - BOTTOM_LINE) * half;

  const noteAt = (midi: number, x: number, main: boolean) => {
    const { step, sharp } = staffStep(midi);
    const y = yOf(step);
    const ledgers: number[] = [];
    for (let s = BOTTOM_LINE - 2; s >= step; s -= 2) ledgers.push(s);
    for (let s = TOP_LINE + 2; s <= step; s += 2) ledgers.push(s);
    const stemUp = step < BOTTOM_LINE + 4;

    return (
      <g key={`${midi}-${x}`} opacity={main ? 1 : 0.35}>
        {ledgers.map((s) => (
          <line
            key={s}
            x1={x - 16}
            y1={yOf(s)}
            x2={x + 16}
            y2={yOf(s)}
            stroke="var(--foreground)"
            strokeWidth={1.5}
          />
        ))}
        {sharp && (
          <text
            x={x - 30}
            y={y + 5}
            fontSize={22}
            fill="var(--accent-strong)"
            textAnchor="middle"
          >
            ♯
          </text>
        )}
        <ellipse
          cx={x}
          cy={y}
          rx={9}
          ry={6.5}
          fill={main ? "var(--accent-strong)" : "var(--muted)"}
          transform={`rotate(-20 ${x} ${y})`}
        />
        <line
          x1={stemUp ? x + 8 : x - 8}
          y1={y}
          x2={stemUp ? x + 8 : x - 8}
          y2={stemUp ? y - 46 : y + 46}
          stroke={main ? "var(--accent-strong)" : "var(--muted)"}
          strokeWidth={2}
        />
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full">
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1={30}
          y1={bottomY - i * gap}
          x2={W - 20}
          y2={bottomY - i * gap}
          stroke="var(--border)"
          strokeWidth={1.5}
        />
      ))}
      {/* penanda kunci G: G4 duduk di garis kedua dari bawah */}
      <text
        x={44}
        y={yOf(staffStep(67).step) + 5}
        fontSize={13}
        fill="var(--muted)"
        textAnchor="middle"
      >
        G
      </text>
      <circle
        cx={44}
        cy={yOf(staffStep(67).step)}
        r={11}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={1}
      />

      {current !== undefined && noteAt(current, 170, true)}
      {upcoming.map((m, i) => noteAt(m, 300 + i * 80, false))}

      <text x={170} y={H - 6} fontSize={11} fill="var(--muted)" textAnchor="middle">
        sekarang
      </text>
      <text x={380} y={H - 6} fontSize={11} fill="var(--muted)" textAnchor="middle">
        berikutnya
      </text>
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-soft bg-surface p-4 text-center">
      <div className="text-[11px] uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-accent-strong">{value}</div>
    </div>
  );
}
