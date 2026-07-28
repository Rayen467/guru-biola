"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { midiToFreq, midiToName } from "@/lib/notes";
import { playTone } from "@/lib/tone";
import AnalysisCard, { type Analysis } from "@/components/AnalysisCard";

// Peta fingerboard posisi 1 + latihan hafalan.
//
// Peta doang gampang dilihat tapi gampang lupa. Yang bikin nempel: disuruh
// NUNJUK. Makanya di sini ada tiga mode — lihat peta, kuis "di mana nada X",
// dan kuis "titik ini nada apa". Dua kuis terakhir arah berpikirnya kebalik,
// dan dua-duanya kepakai pas baca not sambil main.

const STRINGS = [
  { name: "G", open: 55 },
  { name: "D", open: 62 },
  { name: "A", open: 69 },
  { name: "E", open: 76 },
];

// Offset semitone dari senar kosong. Dua pola: mayor (jari 2 tinggi) dan
// minor (jari 2 rendah/nempel jari 1) — pemula wajib tahu bedanya, karena
// itu satu-satunya yang berubah antara D mayor dan D minor di posisi 1.
const PATTERNS = {
  major: {
    label: "Pola mayor (jari 2 tinggi)",
    hint: "Jarak jari 1-2 lebar, jari 2-3 rapat. Ini pola buat D, A, G mayor.",
    fingers: [
      { finger: 0, offset: 0, label: "0 (kosong)" },
      { finger: 1, offset: 2, label: "jari 1 (telunjuk)" },
      { finger: 2, offset: 4, label: "jari 2 (tengah)" },
      { finger: 3, offset: 5, label: "jari 3 (manis)" },
      { finger: 4, offset: 7, label: "jari 4 (kelingking)" },
    ],
  },
  minor: {
    label: "Pola minor (jari 2 rendah)",
    hint: "Jari 2 mundur nempel ke jari 1. Dipakai di tangga nada minor dan nada-nada bermol.",
    fingers: [
      { finger: 0, offset: 0, label: "0 (kosong)" },
      { finger: 1, offset: 2, label: "jari 1 (telunjuk)" },
      { finger: 2, offset: 3, label: "jari 2 (mundur)" },
      { finger: 3, offset: 5, label: "jari 3 (manis)" },
      { finger: 4, offset: 7, label: "jari 4 (kelingking)" },
    ],
  },
} as const;

type Mode = "peta" | "cariNada" | "tebakNada";
type PatternKey = keyof typeof PATTERNS;

interface Answer {
  correct: boolean;
  midi: number;
  chosen?: { s: number; f: number };
}

export default function FingerboardPage() {
  const [mode, setMode] = useState<Mode>("peta");
  const [pattern, setPattern] = useState<PatternKey>("major");
  const [selected, setSelected] = useState<{ s: number; f: number } | null>(null);
  const [quiz, setQuiz] = useState<{ s: number; f: number } | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [choices, setChoices] = useState<number[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const perNote = useRef<Record<number, { ok: number; total: number }>>({});
  const startedAt = useRef(0);

  const P = PATTERNS[pattern];
  const midiAt = useCallback(
    (s: number, f: number) => STRINGS[s].open + P.fingers[f].offset,
    [P]
  );

  const newQuiz = useCallback(
    (m: Mode = mode) => {
      const s = Math.floor(Math.random() * STRINGS.length);
      const f = Math.floor(Math.random() * P.fingers.length);
      setQuiz({ s, f });
      setAnswer(null);
      setSelected(null);
      if (m === "tebakNada") {
        // 4 pilihan: jawaban benar + 3 nada tetangga di peta
        const right = STRINGS[s].open + P.fingers[f].offset;
        const pool = new Set<number>([right]);
        while (pool.size < 4) {
          const rs = Math.floor(Math.random() * STRINGS.length);
          const rf = Math.floor(Math.random() * P.fingers.length);
          pool.add(STRINGS[rs].open + P.fingers[rf].offset);
        }
        setChoices([...pool].sort(() => Math.random() - 0.5));
      }
    },
    [mode, P]
  );

  useEffect(() => {
    if (mode === "peta") {
      setQuiz(null);
      return;
    }
    if (startedAt.current === 0) startedAt.current = performance.now();
    newQuiz(mode);
    // sengaja cuma pas ganti mode/pola — bukan tiap render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pattern]);

  const record = (midi: number, ok: boolean) => {
    const r = perNote.current[midi] ?? { ok: 0, total: 0 };
    r.total++;
    if (ok) r.ok++;
    perNote.current[midi] = r;
    setScore((s) => ({
      correct: s.correct + (ok ? 1 : 0),
      total: s.total + 1,
    }));
  };

  const answerSpot = (s: number, f: number) => {
    if (!quiz || answer) return;
    const target = midiAt(quiz.s, quiz.f);
    const picked = midiAt(s, f);
    const ok = picked === target;
    playTone(midiToFreq(picked), 0.8);
    record(target, ok);
    setAnswer({ correct: ok, midi: target, chosen: { s, f } });
    setTimeout(() => newQuiz(), ok ? 900 : 2000);
  };

  const answerName = (midi: number) => {
    if (!quiz || answer) return;
    const target = midiAt(quiz.s, quiz.f);
    const ok = midi === target;
    playTone(midiToFreq(target), 0.8);
    record(target, ok);
    setAnswer({ correct: ok, midi: target });
    setTimeout(() => newQuiz(), ok ? 900 : 2000);
  };

  const finish = () => {
    setAnalysis(buildAnalysis(score, perNote.current, startedAt.current));
    setMode("peta");
    startedAt.current = 0;
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">🖐️ Fingerboard Posisi 1</h1>
        <p className="mt-1 text-sm text-muted">
          Biola gak punya fret — ini petanya. Tapi peta yang cuma dilihat bakal
          lupa; makanya ada mode kuis. Nunjuk sendiri itu yang bikin nempel.
        </p>
      </header>

      {/* Mode */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { v: "peta", label: "🗺️ Lihat peta" },
            { v: "cariNada", label: "🔍 Di mana nada ini?" },
            { v: "tebakNada", label: "❓ Titik ini nada apa?" },
          ] as { v: Mode; label: string }[]
        ).map((m) => (
          <button
            key={m.v}
            onClick={() => {
              setMode(m.v);
              setScore({ correct: 0, total: 0 });
              perNote.current = {};
              startedAt.current = 0;
              setAnalysis(null);
            }}
            className={`press rounded-full px-4 py-2 text-sm ${
              mode === m.v
                ? "bg-accent font-semibold text-background"
                : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Pola jari */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(PATTERNS) as PatternKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setPattern(k)}
            className={`press rounded-full px-3 py-1.5 text-xs ${
              pattern === k
                ? "bg-accent font-semibold text-background"
                : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {PATTERNS[k].label}
          </button>
        ))}
      </div>
      <p className="-mt-3 text-xs text-muted">{P.hint}</p>

      {/* Soal */}
      {quiz && (
        <div className="animate-fade-up rounded-2xl border border-accent/50 bg-accent/10 p-4 text-center">
          {mode === "cariNada" ? (
            <>
              <div className="text-xs uppercase tracking-wide text-muted">
                Tunjuk di peta:
              </div>
              <div className="text-4xl font-bold text-accent-strong">
                {midiToName(midiAt(quiz.s, quiz.f))}
              </div>
              <button
                onClick={() => playTone(midiToFreq(midiAt(quiz.s, quiz.f)), 1)}
                className="press mt-1 text-xs text-muted underline-offset-2 hover:underline"
              >
                🔊 dengar nadanya
              </button>
            </>
          ) : (
            <>
              <div className="text-xs uppercase tracking-wide text-muted">
                Titik yang nyala di peta itu nada apa?
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {choices.map((c) => (
                  <button
                    key={c}
                    onClick={() => answerName(c)}
                    disabled={!!answer}
                    className="press rounded-xl border border-border-soft bg-surface px-5 py-3 text-lg font-semibold hover:border-accent disabled:opacity-60"
                  >
                    {midiToName(c)}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-2 min-h-6 text-sm font-bold">
            {answer &&
              (answer.correct ? (
                <span className="animate-pop inline-block text-good">BENER! 🎉</span>
              ) : (
                <span className="text-bad">
                  Salah — yang bener {midiToName(answer.midi)} di senar{" "}
                  {STRINGS[quiz.s].name}, {P.fingers[quiz.f].label}
                </span>
              ))}
          </div>

          <div className="mt-1 flex items-center justify-center gap-4 text-xs text-muted">
            <span>
              Skor:{" "}
              <b className="text-foreground">
                {score.correct}/{score.total}
              </b>
            </span>
            {score.total >= 5 && (
              <button
                onClick={finish}
                className="press rounded-full bg-surface-2 px-3 py-1 text-foreground"
              >
                ⏹️ Selesai & lihat analisis
              </button>
            )}
          </div>
        </div>
      )}

      <AnalysisCard analysis={analysis} onClose={() => setAnalysis(null)} />

      {/* Peta */}
      <div className="rounded-2xl border border-border-soft bg-surface p-4 sm:p-6">
        <div className="mb-2 grid grid-cols-[6rem_repeat(4,1fr)] gap-2 text-center">
          <div />
          {STRINGS.map((s) => (
            <div key={s.name} className="text-sm font-bold text-accent-strong">
              senar {s.name}
            </div>
          ))}
        </div>

        {P.fingers.map((f, fi) => (
          <div
            key={f.finger}
            className="grid grid-cols-[6rem_repeat(4,1fr)] items-center gap-2 border-t border-border-soft py-2"
          >
            <div className="text-[11px] text-muted">{f.label}</div>
            {STRINGS.map((s, si) => {
              const midi = s.open + f.offset;
              const isSel = selected?.s === si && selected?.f === fi;
              const isQuizSpot =
                mode === "tebakNada" && quiz?.s === si && quiz?.f === fi;
              const isWrongPick =
                answer &&
                !answer.correct &&
                answer.chosen?.s === si &&
                answer.chosen?.f === fi;
              const isRightSpot =
                answer && quiz?.s === si && quiz?.f === fi;

              return (
                <button
                  key={s.name}
                  onClick={() => {
                    if (mode === "cariNada") {
                      answerSpot(si, fi);
                      return;
                    }
                    setSelected({ s: si, f: fi });
                    playTone(midiToFreq(midi), 1.2);
                  }}
                  className={`press mx-auto flex h-11 w-11 items-center justify-center rounded-full border text-xs font-semibold sm:h-12 sm:w-12 sm:text-sm ${
                    isQuizSpot
                      ? "animate-glow-good border-accent bg-accent text-background"
                      : isRightSpot
                        ? "border-good bg-good/30"
                        : isWrongPick
                          ? "border-bad bg-bad/30"
                          : isSel
                            ? "border-accent bg-accent text-background"
                            : f.finger === 0
                              ? "border-dashed border-muted bg-surface-2 text-muted hover:border-accent hover:text-foreground"
                              : "border-border-soft bg-surface-2 hover:border-accent"
                  }`}
                  title={`${midiToName(midi)} — ${f.label}`}
                >
                  {/* pas kuis "titik ini nada apa", namanya disembunyiin */}
                  {mode === "tebakNada" && !answer
                    ? isQuizSpot
                      ? "?"
                      : ""
                    : midiToName(midi)}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-border-soft bg-surface p-4 text-xs text-muted">
        <p>
          💡 <b className="text-foreground">Patokan paling berguna:</b> jari 3 di
          satu senar = senar kosong berikutnya. Jari 3 di senar D harus sama
          persis bunyinya sama senar A kosong — bunyiin dua-duanya, itu cara
          ngecek intonasi paling gampang tanpa alat.
        </p>
        <p>
          🎯 Kalau udah lancar dua kuis di atas, lanjut ke{" "}
          <Link href="/intonasi" className="text-accent-strong underline">
            latihan intonasi
          </Link>{" "}
          — di sana jarinya beneran dipakai, bukan cuma ditunjuk.
        </p>
      </div>
    </div>
  );
}

function buildAnalysis(
  score: { correct: number; total: number },
  perNote: Record<number, { ok: number; total: number }>,
  startedAt: number
): Analysis | null {
  if (score.total < 5) return null;
  const acc = Math.round((score.correct / score.total) * 100);
  const seconds = startedAt ? (performance.now() - startedAt) / 1000 : 0;

  const weak = Object.entries(perNote)
    .map(([midi, r]) => ({ midi: Number(midi), rate: r.ok / r.total, total: r.total }))
    .filter((n) => n.total >= 2 && n.rate < 0.7)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 4);

  const verdicts = [
    {
      icon: acc >= 85 ? "🎯" : acc >= 60 ? "📈" : "🌱",
      title: `${score.correct} bener dari ${score.total} (${acc}%)`,
      detail:
        acc >= 85
          ? "Peta posisi 1 udah kepegang. Lanjut ke latihan intonasi supaya jarinya beneran ngedarat di situ."
          : acc >= 60
            ? "Setengah jalan. Ulangi besok — hafalan peta itu cepat nempel kalau sering, bukan kalau lama."
            : "Masih baru. Balik ke mode 'Lihat peta' dulu 2 menit, baru kuis lagi.",
      tone: (acc >= 85 ? "good" : acc >= 60 ? "warn" : "bad") as
        | "good"
        | "warn"
        | "bad",
    },
  ];

  if (weak.length) {
    verdicts.push({
      icon: "🧱",
      title: `Masih goyang: ${weak.map((w) => midiToName(w.midi)).join(", ")}`,
      detail:
        "Nada-nada ini yang paling sering salah tunjuk. Bunyiin di peta 5x sambil sebut namanya keras-keras sebelum kuis lagi.",
      tone: "warn" as const,
    });
  }

  if (seconds > 0) {
    verdicts.push({
      icon: "⏱️",
      title: `${Math.round(seconds)} detik · ${(seconds / score.total).toFixed(1)} detik per soal`,
      detail:
        seconds / score.total < 4
          ? "Cepat — tandanya udah refleks, bukan ngitung."
          : "Masih ngitung dari senar kosong. Itu normal di awal; kecepatan bakal dateng sendiri.",
      tone: (seconds / score.total < 4 ? "good" : "warn") as "good" | "warn",
    });
  }

  return {
    score: acc,
    headline: "Analisis kuis fingerboard",
    subline: `${score.total} soal dijawab · ${Object.keys(perNote).length} nada berbeda kesentuh`,
    verdicts,
  };
}
