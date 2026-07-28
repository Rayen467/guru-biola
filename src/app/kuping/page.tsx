"use client";

import { useRef, useState } from "react";
import { midiToFreq } from "@/lib/notes";
import { playTone } from "@/lib/tone";
import { updateProgress } from "@/lib/progress";
import AnalysisCard, { type Analysis } from "@/components/AnalysisCard";

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
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  // Catatan per ukuran interval — dari sini ketahuan lu mentok di lebar berapa.
  const perGap = useRef<Record<number, { ok: number; total: number }>>({});
  const bestLevel = useRef(0);
  const askedAt = useRef(0);
  const times = useRef<number[]>([]);

  const level = LEVELS[levelIdx];

  const newQuestion = (lvIdx = levelIdx) => {
    // nada dasar acak di rentang nyaman biola: G3(55)..E5(76)
    const base = 55 + Math.floor(Math.random() * (76 - 55 - LEVELS[lvIdx].gap));
    const higherFirst = Math.random() < 0.5;
    const a = higherFirst ? base + LEVELS[lvIdx].gap : base;
    const b = higherFirst ? base : base + LEVELS[lvIdx].gap;
    setPair({ a, b });
    setAnswered(null);
    askedAt.current = performance.now();
    bestLevel.current = Math.max(bestLevel.current, lvIdx);
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

    // catat per lebar interval + waktu jawab (buat analisis akhir)
    const gap = level.gap;
    const rec = perGap.current[gap] ?? { ok: 0, total: 0 };
    rec.total += 1;
    if (ok) rec.ok += 1;
    perGap.current[gap] = rec;
    if (askedAt.current) {
      // 2 detik pertama itu durasi bunyi dua nadanya, bukan waktu mikir
      times.current.push(
        Math.max(0, (performance.now() - askedAt.current) / 1000 - 2)
      );
    }

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

        {score.total >= 5 && (
          <button
            onClick={() => {
              setAnalysis(
                buildEarAnalysis(score, perGap.current, times.current, bestLevel.current)
              );
              setPair(null);
            }}
            className="mt-5 rounded-full bg-surface-2 px-5 py-2 text-sm text-foreground transition-colors hover:bg-border-soft"
          >
            ⏹️ Selesai & lihat analisis
          </button>
        )}
      </div>

      <AnalysisCard analysis={analysis} onClose={() => setAnalysis(null)} />

      <div className="rounded-xl border border-border-soft bg-surface p-4 text-sm text-muted">
        💡 Tips: jangan mikir &quot;nama nada&quot;. Rasain aja arah — naik apa
        turun. Kayak bedain suara orang nanya (naik) vs nyuruh (turun). 10
        soal/hari cukup, yang penting rutin.
      </div>
    </div>
  );
}

// Analisis sesi kuping. Yang dicari bukan cuma "bener berapa", tapi MENTOK DI
// LEBAR INTERVAL BERAPA — itu yang nentuin latihan besok mesti di level mana.
const GAP_NAMES: Record<number, string> = {
  12: "1 oktaf",
  7: "kuin (5th)",
  4: "terts (3rd)",
  2: "1 nada penuh",
  1: "setengah nada",
};

function buildEarAnalysis(
  score: { correct: number; total: number },
  perGap: Record<number, { ok: number; total: number }>,
  times: number[],
  bestLevel: number
): Analysis | null {
  if (score.total < 5) return null;
  const acc = Math.round((score.correct / score.total) * 100);
  const verdicts = [];

  const rows = Object.entries(perGap)
    .map(([gap, r]) => ({
      gap: Number(gap),
      pct: Math.round((r.ok / r.total) * 100),
      total: r.total,
    }))
    .filter((r) => r.total >= 3)
    .sort((a, b) => b.gap - a.gap);

  const mastered = rows.filter((r) => r.pct >= 80);
  const stuck = rows.filter((r) => r.pct < 60);

  verdicts.push({
    icon: acc >= 80 ? "🎯" : acc >= 60 ? "📈" : "🌱",
    title: `Akurasi ${acc}% dari ${score.total} soal`,
    detail:
      acc >= 80
        ? "Di atas 80% artinya kuping lu udah bisa dipercaya di level ini. Naikin kesulitannya."
        : acc >= 60
          ? "Masih separo-separo. Ini fase normal — yang penting rutin, bukan lama."
          : "Di bawah 60% berarti soalnya kekencengan buat sekarang. Turun level dulu, bangun rasa percaya diri.",
    tone: (acc >= 80 ? "good" : acc >= 60 ? "warn" : "bad") as
      | "good"
      | "warn"
      | "bad",
  });

  if (mastered.length) {
    verdicts.push({
      icon: "✅",
      title: `Udah kebaca: ${mastered.map((r) => GAP_NAMES[r.gap] ?? `${r.gap} semitone`).join(", ")}`,
      detail: "Interval selebar ini udah gak perlu lu pikir lagi.",
      tone: "good" as const,
    });
  }

  if (stuck.length) {
    const s = stuck[0];
    verdicts.push({
      icon: "🧱",
      title: `Mentok di ${GAP_NAMES[s.gap] ?? `${s.gap} semitone`} (bener ${s.pct}%)`,
      detail:
        s.gap <= 1
          ? "Setengah nada emang paling susah — ini level pemain beneran. Bantu pakai drone di menu Intonasi: main nada dasarnya terus, telinga lu bakal denger 'gesekan' pas nadanya deket."
          : "Ulangi lebar ini besok sebelum naik lagi. Trik: nyanyi ulang dua nadanya sebelum jawab — suara lu sendiri bikin bedanya lebih jelas.",
      tone: "warn" as const,
    });
  }

  if (times.length >= 3) {
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    verdicts.push({
      icon: "⏱️",
      title: `Waktu mikir rata-rata ${median.toFixed(1)} detik`,
      detail:
        median < 1.5
          ? "Cepat — lu udah ngandelin rasa, bukan ngitung. Itu tujuannya."
          : "Masih agak lama. Coba jawab pakai kesan pertama; nebak dari 'rasa' biasanya lebih akurat daripada dianalisis lama.",
      tone: (median < 1.5 ? "good" : "warn") as "good" | "warn",
    });
  }

  verdicts.push({
    icon: "📅",
    title: "Latihan besok",
    detail: stuck.length
      ? `Mulai dari ${GAP_NAMES[stuck[0].gap] ?? "level terakhir"}, 10 soal. Berhenti begitu bener 8 dari 10.`
      : `Naikin ke level ${Math.min(5, bestLevel + 2)}. 10 soal/hari, bukan 100 soal seminggu sekali.`,
    tone: "good" as const,
  });

  return {
    score: acc,
    headline: "Analisis latih kuping",
    subline: `${score.correct} bener dari ${score.total} · level tertinggi yang kesentuh: ${bestLevel + 1}`,
    verdicts,
  };
}
