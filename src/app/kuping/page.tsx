"use client";

import { useRef, useState } from "react";
import { midiToFreq } from "@/lib/notes";
import { playTone } from "@/lib/tone";
import { updateProgress } from "@/lib/progress";

// Latih kuping: 2 nada dibunyikan, tebak mana lebih tinggi.
// Adaptif: bener terus → interval makin kecil (makin susah).

const LEVELS = [
  { gap: 12, label: "1 oktaf — gampang banget" },
  { gap: 7, label: "kuin (5th) — masih kerasa jelas" },
  { gap: 4, label: "terts (3rd) — mulai mikir" },
  { gap: 2, label: "1 nada penuh — lumayan" },
  { gap: 1, label: "setengah nada — level pemain beneran" },
];

const STREAK_TO_ADVANCE = 3;

export default function KupingPage() {
  const [levelIdx, setLevelIdx] = useState(0);
  const [pair, setPair] = useState<{ a: number; b: number } | null>(null);
  const [answered, setAnswered] = useState<"benar" | "salah" | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [streak, setStreak] = useState(0);
  const advStreak = useRef(0);

  const level = LEVELS[levelIdx];

  const newQuestion = (lvIdx = levelIdx) => {
    // nada dasar acak di rentang nyaman biola: G3(55)..E5(76)
    const base = 55 + Math.floor(Math.random() * (76 - 55 - LEVELS[lvIdx].gap));
    const higherFirst = Math.random() < 0.5;
    const a = higherFirst ? base + LEVELS[lvIdx].gap : base;
    const b = higherFirst ? base : base + LEVELS[lvIdx].gap;
    setPair({ a, b });
    setAnswered(null);
    playTone(midiToFreq(a), 0.9);
    setTimeout(() => playTone(midiToFreq(b), 0.9), 1100);
  };

  const replay = () => {
    if (!pair) return;
    playTone(midiToFreq(pair.a), 0.9);
    setTimeout(() => playTone(midiToFreq(pair.b), 0.9), 1100);
  };

  const answer = (choice: "pertama" | "kedua") => {
    if (!pair || answered) return;
    const correctChoice = pair.a > pair.b ? "pertama" : "kedua";
    const ok = choice === correctChoice;
    setAnswered(ok ? "benar" : "salah");
    setScore((s) => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }));
    setStreak((st) => (ok ? st + 1 : 0));
    updateProgress((p) => {
      p.earTraining.total += 1;
      if (ok) {
        p.earTraining.correct += 1;
        p.earTraining.bestStreak = Math.max(
          p.earTraining.bestStreak,
          streak + 1
        );
      }
    });

    let nextLevel = levelIdx;
    if (ok) {
      advStreak.current += 1;
      if (advStreak.current >= STREAK_TO_ADVANCE && levelIdx < LEVELS.length - 1) {
        nextLevel = levelIdx + 1;
        setLevelIdx(nextLevel);
        advStreak.current = 0;
      }
    } else {
      advStreak.current = 0;
      if (levelIdx > 0) {
        nextLevel = levelIdx - 1;
        setLevelIdx(nextLevel);
      }
    }
    setTimeout(() => newQuestion(nextLevel), 1200);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">👂 Latih Kuping</h1>
        <p className="mt-1 text-sm text-muted">
          &quot;Buta nada&quot; hampir selalu cuma kuping yang belum dilatih —
          bukan cacat permanen. Dua nada dibunyikan berurutan. Tebak mana yang
          lebih <b>tinggi</b>. Bener {STREAK_TO_ADVANCE}x berturut = naik level
          (interval makin kecil).
        </p>
      </header>

      <div className="rounded-2xl border border-border-soft bg-surface p-6 text-center">
        <div className="text-xs uppercase tracking-wide text-muted">
          Level {levelIdx + 1}/{LEVELS.length}
        </div>
        <div className="mt-1 font-semibold text-accent-strong">{level.label}</div>

        <div className="my-6">
          {pair === null ? (
            <button
              onClick={() => newQuestion()}
              className="rounded-full bg-accent px-6 py-3 font-semibold text-background transition-colors hover:bg-accent-strong"
            >
              🔊 Mulai soal pertama
            </button>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => answer("pertama")}
                  disabled={answered !== null}
                  className="rounded-xl border border-border-soft bg-surface-2 px-8 py-4 text-lg font-semibold transition-colors hover:border-accent disabled:opacity-60"
                >
                  Nada ke-1 ☝️
                </button>
                <button
                  onClick={() => answer("kedua")}
                  disabled={answered !== null}
                  className="rounded-xl border border-border-soft bg-surface-2 px-8 py-4 text-lg font-semibold transition-colors hover:border-accent disabled:opacity-60"
                >
                  Nada ke-2 ✌️
                </button>
              </div>
              <button
                onClick={replay}
                disabled={answered !== null}
                className="text-sm text-muted underline-offset-2 hover:underline disabled:opacity-50"
              >
                🔁 Puter ulang
              </button>
              <div className="min-h-8 text-xl font-bold">
                {answered === "benar" && (
                  <span className="text-good">BENER! 🎉</span>
                )}
                {answered === "salah" && (
                  <span className="text-bad">Salah — dengerin lagi soal berikutnya</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-center gap-6 text-sm text-muted">
          <span>
            Skor:{" "}
            <b className="text-foreground">
              {score.correct}/{score.total}
            </b>
          </span>
          <span>
            Streak: <b className="text-accent-strong">{streak} 🔥</b>
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-border-soft bg-surface p-4 text-sm text-muted">
        💡 Tips: jangan mikir &quot;nama nada&quot;. Rasain aja arah — naik apa
        turun. Kayak bedain suara orang nanya (naik) vs nyuruh (turun). 10
        soal/hari cukup, yang penting rutin.
      </div>
    </div>
  );
}
