"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatDuration,
  loadProgress,
  practiceStats,
  type Progress,
} from "@/lib/progress";
import AnalysisCard, { type Analysis } from "@/components/AnalysisCard";

// Sesi latihan terpandu.
//
// Masalah pemula bukan kurang alat — tapi gak tahu HARUS NGAPAIN DULUAN dan
// berapa lama. Halaman ini yang mimpin: tiap langkah punya jatah waktu,
// alatnya kebuka di tab sebelah biar timernya jalan terus, dan di akhir
// hasilnya diukur dari SELISIH catatan latihan sebelum vs sesudah — bukan dari
// centang manual yang gampang dibohongi.

interface Step {
  id: string;
  emoji: string;
  title: string;
  why: string;
  seconds: number;
  href: string;
}

const ROUTINES: { id: string; name: string; desc: string; steps: Step[] }[] = [
  {
    id: "harian",
    name: "Harian · 15 menit",
    desc: "Rutinitas minimum yang ngefek. Kalau cuma punya waktu segini, ini urutannya.",
    steps: [
      { id: "tuner", emoji: "🎯", title: "Stem senar", why: "Latihan di biola fals = ngelatih kuping ke nada salah.", seconds: 120, href: "/tuner" },
      { id: "intonasi", emoji: "🎻", title: "Nada panjang + intonasi", why: "Gesekan panjang benerin bunyi; nada target benerin jari.", seconds: 360, href: "/intonasi" },
      { id: "kuping", emoji: "👂", title: "Latih kuping", why: "10 soal. Kuping yang kebentuk bikin jari otomatis ngoreksi.", seconds: 180, href: "/kuping" },
      { id: "ritme", emoji: "⏱️", title: "Ritme", why: "Nada bener tapi tempo goyang tetap kedengeran amatir.", seconds: 240, href: "/ritme" },
    ],
  },
  {
    id: "lengkap",
    name: "Lengkap · 30 menit",
    desc: "Kalau lagi ada waktu. Nambah postur, baca not, dan lagu.",
    steps: [
      { id: "tuner", emoji: "🎯", title: "Stem senar", why: "Wajib tiap mulai.", seconds: 120, href: "/tuner" },
      { id: "postur", emoji: "🧍", title: "Cek postur", why: "Benerin badan sebelum capek — postur salah pas capek makin susah dibenerin.", seconds: 180, href: "/postur" },
      { id: "intonasi", emoji: "🎻", title: "Tangga nada + intonasi", why: "Inti latihan. Pelan, dengerin tiap nada.", seconds: 480, href: "/intonasi" },
      { id: "notasi", emoji: "🎼", title: "Baca not", why: "Biar bisa main lagu baru tanpa nunggu dicontohin.", seconds: 240, href: "/notasi" },
      { id: "ritme", emoji: "⏱️", title: "Ritme + metronom", why: "Tempo dilatih terpisah dulu, baru digabung ke lagu.", seconds: 300, href: "/ritme" },
      { id: "lagu", emoji: "🎵", title: "Lagu", why: "Bagian yang bikin betah. Taruh di akhir sebagai hadiah.", seconds: 480, href: "/lagu" },
    ],
  },
  {
    id: "kilat",
    name: "Kilat · 7 menit",
    desc: "Buat hari yang mepet. Lebih baik 7 menit tiap hari daripada 2 jam seminggu sekali.",
    steps: [
      { id: "tuner", emoji: "🎯", title: "Stem", why: "Cepat, tapi jangan dilewat.", seconds: 90, href: "/tuner" },
      { id: "intonasi", emoji: "🎻", title: "Satu tangga nada", why: "Satu set, pelan, sampai bersih.", seconds: 240, href: "/intonasi" },
      { id: "kuping", emoji: "👂", title: "5 soal kuping", why: "Cukup buat jaga kebiasaan.", seconds: 90, href: "/kuping" },
    ],
  },
];

export default function LatihanPage() {
  const [routineId, setRoutineId] = useState(ROUTINES[0].id);
  const [stepIdx, setStepIdx] = useState(-1); // -1 = belum mulai
  const [left, setLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const snapshot = useRef<Progress | null>(null);
  const startedAt = useRef(0);

  const routine = ROUTINES.find((r) => r.id === routineId)!;
  const step = stepIdx >= 0 ? routine.steps[stepIdx] : null;
  const totalSeconds = routine.steps.reduce((s, x) => s + x.seconds, 0);

  const finish = useCallback(() => {
    setStepIdx(-1);
    setAnalysis(
      buildSessionAnalysis(
        snapshot.current,
        loadProgress(),
        (performance.now() - startedAt.current) / 1000,
        done,
        routine.steps.length
      )
    );
  }, [done, routine.steps.length]);

  const nextStep = useCallback(() => {
    setDone((d) => (step ? [...d, step.title] : d));
    if (stepIdx + 1 >= routine.steps.length) {
      finish();
    } else {
      setStepIdx(stepIdx + 1);
      setLeft(routine.steps[stepIdx + 1].seconds);
    }
  }, [step, stepIdx, routine.steps, finish]);

  // Timer per langkah. Habis waktunya → lanjut sendiri.
  useEffect(() => {
    if (stepIdx < 0 || paused) return;
    const id = window.setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          // pindah langkah di luar setState biar gak nyangkut
          window.setTimeout(nextStep, 0);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [stepIdx, paused, nextStep]);

  const begin = () => {
    snapshot.current = loadProgress();
    startedAt.current = performance.now();
    setDone([]);
    setAnalysis(null);
    setStepIdx(0);
    setLeft(routine.steps[0].seconds);
    setPaused(false);
  };

  const mmss = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">🗓️ Sesi Latihan Terpandu</h1>
        <p className="mt-1 text-sm text-muted">
          Masalah pemula jarang kurang alat — biasanya bingung mulai dari mana
          dan berapa lama. Ini yang mimpin: tiap langkah ada jatah waktunya,
          dan di akhir hasilnya diukur dari catatan latihan lu yang beneran
          nambah, bukan dari centang manual.
        </p>
      </header>

      {stepIdx < 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {ROUTINES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRoutineId(r.id)}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${
                  r.id === routineId
                    ? "bg-accent font-semibold text-background"
                    : "bg-surface-2 text-muted hover:text-foreground"
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>
          <p className="-mt-3 text-xs text-muted">{routine.desc}</p>

          <ol className="space-y-2">
            {routine.steps.map((s, i) => (
              <li
                key={s.id}
                className="flex items-start gap-3 rounded-xl border border-border-soft bg-surface p-3"
              >
                <span className="text-xl">{s.emoji}</span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold">
                    {i + 1}. {s.title}
                  </span>
                  <span className="block text-xs text-muted">{s.why}</span>
                </span>
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                  {Math.round(s.seconds / 60)} mnt
                </span>
              </li>
            ))}
          </ol>

          <button
            onClick={begin}
            className="w-full rounded-full bg-accent px-6 py-3 font-semibold text-background transition-colors hover:bg-accent-strong"
          >
            ▶ Mulai sesi · total {Math.round(totalSeconds / 60)} menit
          </button>
        </>
      )}

      {/* Langkah berjalan */}
      {step && (
        <div className="animate-fade-up rounded-2xl border border-accent/50 bg-surface p-6 text-center">
          <div className="text-xs uppercase tracking-wide text-muted">
            Langkah {stepIdx + 1} dari {routine.steps.length}
          </div>
          <div className="mt-2 text-5xl">{step.emoji}</div>
          <h2 className="mt-1 text-xl font-bold">{step.title}</h2>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted">{step.why}</p>

          <div className="mt-4 text-6xl font-bold tabular-nums text-accent-strong">
            {mmss(left)}
          </div>
          <div className="mx-auto mt-3 h-2 max-w-md overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-accent transition-all duration-1000 ease-linear"
              style={{ width: `${((step.seconds - left) / step.seconds) * 100}%` }}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={step.href}
              target="_blank"
              rel="noopener"
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-background hover:bg-accent-strong"
            >
              Buka {step.title} ↗
            </Link>
            <button
              onClick={() => setPaused((p) => !p)}
              className="rounded-full bg-surface-2 px-4 py-2.5 text-sm text-foreground hover:bg-border-soft"
            >
              {paused ? "▶ Lanjut" : "⏸ Jeda"}
            </button>
            <button
              onClick={nextStep}
              className="rounded-full bg-surface-2 px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              Langkah berikutnya →
            </button>
            <button
              onClick={finish}
              className="rounded-full px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              Selesai lebih awal
            </button>
          </div>

          <p className="mt-3 text-[11px] text-muted">
            Alatnya kebuka di tab baru — halaman ini tetap ngitung waktunya.
            Balik ke sini kalau timernya udah bunyi.
          </p>
        </div>
      )}

      <AnalysisCard analysis={analysis} onClose={() => setAnalysis(null)} />
    </div>
  );
}

// Analisis sesi: dibandingin snapshot progres sebelum vs sesudah. Yang
// dilaporin cuma yang MEMANG kecatat — kalau lu cuma buka halamannya tanpa
// latihan, angkanya nol dan laporannya bakal jujur bilang gitu.
function buildSessionAnalysis(
  before: Progress | null,
  after: Progress,
  seconds: number,
  doneSteps: string[],
  totalSteps: number
): Analysis | null {
  if (!before || seconds < 20) return null;

  const dPractice =
    Object.values(after.practiceSeconds).reduce((s, v) => s + v, 0) -
    Object.values(before.practiceSeconds).reduce((s, v) => s + v, 0);
  const dEar = after.earTraining.total - before.earTraining.total;
  const dEarOk = after.earTraining.correct - before.earTraining.correct;
  const dInto = after.intonation.attempts - before.intonation.attempts;
  const dIntoOk = after.intonation.hits - before.intonation.hits;
  const dRhythm = (after.rhythm?.rounds ?? 0) - (before.rhythm?.rounds ?? 0);
  const stats = practiceStats(after);

  const verdicts = [];

  // Di bawah semenit jangan ditulis "0 menit" — bikin laporannya keliatan rusak.
  const durasi =
    seconds < 60
      ? `${Math.round(seconds)} detik`
      : `${Math.round(seconds / 60)} menit`;

  verdicts.push({
    icon: "⏱️",
    title: `Sesi ${durasi} · ${doneSteps.length}/${totalSteps} langkah`,
    detail:
      doneSteps.length === totalSteps
        ? "Rutinitas kelar utuh. Konsistensi kayak gini yang ngalahin latihan maraton sesekali."
        : `Berhenti di langkah ${doneSteps.length + 1}. Gak apa — sesi pendek yang beneran dikerjain lebih berguna daripada rencana panjang yang gak jalan.`,
    tone: (doneSteps.length === totalSteps ? "good" : "warn") as "good" | "warn",
  });

  verdicts.push({
    icon: dPractice > 60 ? "🎻" : "🤔",
    title:
      dPractice > 0
        ? `Mic aktif ${formatDuration(dPractice)} selama sesi`
        : "Gak ada waktu main yang kecatat",
    detail:
      dPractice > 60
        ? "Ini waktu biola beneran bunyi, bukan waktu buka aplikasi."
        : "Timer jalan tapi mic gak pernah nyala — berarti sesinya lebih banyak baca daripada main. Sesi berikutnya, nyalain mic-nya.",
    tone: (dPractice > 60 ? "good" : "warn") as "good" | "warn",
  });

  if (dInto > 0) {
    const pct = Math.round((dIntoOk / dInto) * 100);
    verdicts.push({
      icon: "🎯",
      title: `Intonasi: ${dIntoOk} kena dari ${dInto} percobaan (${pct}%)`,
      detail:
        pct >= 70
          ? "Jari lu udah mulai hafal tempatnya. Naikin ke set yang lebih panjang."
          : "Di bawah 70% — pelanin. Satu nada bersih lebih berharga daripada sepuluh nada buru-buru.",
      tone: (pct >= 70 ? "good" : "warn") as "good" | "warn",
    });
  }

  if (dEar > 0) {
    const pct = Math.round((dEarOk / dEar) * 100);
    verdicts.push({
      icon: "👂",
      title: `Kuping: ${dEarOk}/${dEar} bener (${pct}%)`,
      detail:
        pct >= 80
          ? "Naikin level intervalnya besok."
          : "Ulangi lebar interval yang sama besok sebelum naik.",
      tone: (pct >= 80 ? "good" : "warn") as "good" | "warn",
    });
  }

  if (dRhythm > 0) {
    verdicts.push({
      icon: "⏱️",
      title: `${dRhythm} sesi ritme kelar`,
      detail:
        after.rhythm.lastAvgMs !== null
          ? `Rata-rata meleset ${after.rhythm.lastAvgMs} ms. Di bawah 50 ms udah gak kedengeran orang.`
          : "Tercatat.",
      tone: "good" as const,
    });
  }

  verdicts.push({
    icon: "🔥",
    title: `Streak sekarang ${stats.streak} hari`,
    detail:
      stats.todaySeconds >= 900
        ? "Target harian 15 menit kelewat. Berhenti di sini juga udah cukup."
        : `Hari ini baru ${formatDuration(stats.todaySeconds)}. Target 15 menit.`,
    tone: (stats.todaySeconds >= 900 ? "good" : "warn") as "good" | "warn",
  });

  // Skor dari kelengkapan langkah + apakah beneran main
  let score = Math.round((doneSteps.length / totalSteps) * 50);
  if (dPractice > 60) score += 20;
  if (dPractice > 300) score += 10;
  if (dInto > 0) score += 10;
  if (dEar > 0) score += 10;

  return {
    score: Math.min(100, score),
    headline: "Analisis sesi latihan",
    subline: `Diukur dari selisih catatan latihan sebelum vs sesudah sesi — bukan dari langkah yang lu centang`,
    verdicts,
  };
}
