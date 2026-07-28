"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CURRICULUM } from "@/lib/curriculum";
import {
  loadProgress,
  practiceStats,
  problemNotes,
  updateProgress,
  type Progress,
} from "@/lib/progress";
import { midiToName } from "@/lib/notes";

interface Advice {
  headline: string;
  why: string;
  actions: { label: string; href: string }[];
  notes: string[];
}

// Aturannya sengaja sederhana dan bisa dijelasin ke user — bukan tebak-tebakan
// pintar-pintaran. Urutan periksa = urutan prioritas latihan biola beneran:
// stem dulu, baru intonasi, baru kuping, baru tempo, baru repertoar.
function buildAdvice(p: Progress, done: Record<string, boolean>): Advice {
  const stats = practiceStats(p);
  const weak = problemNotes(p).filter((n) => n.rate < 0.85);
  const noteLabels = weak.slice(0, 4).map((n) => midiToName(n.midi));

  const intoAcc =
    p.intonation.attempts >= 15
      ? p.intonation.hits / p.intonation.attempts
      : null;
  const earAcc =
    p.earTraining.total >= 15 ? p.earTraining.correct / p.earTraining.total : null;
  const rhythm = p.rhythm?.bestAvgMs ?? null;

  // Level pertama yang belum kelar
  const level = CURRICULUM.find((lv) =>
    lv.exercises.some((_, i) => !done[`${lv.id}:${i}`])
  );

  // 1. Belum latihan hari ini → apa pun kalah sama konsistensi
  if (stats.todaySeconds < 300) {
    return {
      headline:
        stats.streak > 0
          ? `Jaga streak ${stats.streak} hari — 5 menit aja cukup`
          : "Mulai dari stem, 5 menit",
      why: "Belum ada latihan berarti hari ini. Latihan pendek yang rutin ngalahin latihan panjang seminggu sekali — mulai dari stem, terus satu tangga nada.",
      actions: [
        { label: "🎯 Stem", href: "/tuner" },
        { label: "🎻 Intonasi", href: "/intonasi" },
      ],
      notes: noteLabels,
    };
  }

  // 2. Ada nada yang jelas bermasalah → itu yang paling cepat ngasih hasil
  if (weak.length >= 2) {
    return {
      headline: `Beresin ${weak.length} nada yang masih meleset`,
      why: "App udah nyatat nada mana yang sering gagal dari latihan lu. Ngerjain nada itu doang jauh lebih cepat daripada ngulang seluruh tangga nada. Nyalain drone di nada dasarnya biar telinganya dapet patokan.",
      actions: [{ label: "🎻 Latih nada bermasalah", href: "/intonasi" }],
      notes: noteLabels,
    };
  }

  // 3. Intonasi masih rendah → pelanin, jangan nambah materi
  if (intoAcc !== null && intoAcc < 0.65) {
    return {
      headline: "Turunin kecepatan, rapiin intonasi dulu",
      why: `Akurasi intonasi lu ${Math.round(intoAcc * 100)}%. Di bawah 65% berarti jari belum hafal tempatnya — nambah materi baru sekarang cuma numpuk kesalahan. Satu set, pelan, sampai bersih.`,
      actions: [
        { label: "🎻 Intonasi + drone", href: "/intonasi" },
        { label: "🎯 Cek stem", href: "/tuner" },
      ],
      notes: noteLabels,
    };
  }

  // 4. Kuping ketinggalan
  if (earAcc !== null && earAcc < 0.7) {
    return {
      headline: "Kuping ketinggalan dari jari",
      why: `Akurasi ear training ${Math.round(earAcc * 100)}%. Jari lu udah lumayan, tapi telinga belum bisa ngoreksi sendiri — dan itu yang bikin intonasi mentok. 10 soal per hari cukup.`,
      actions: [{ label: "👂 Latih kuping", href: "/kuping" }],
      notes: noteLabels,
    };
  }

  // 5. Ritme belum pernah / masih kasar
  if (rhythm === null || rhythm > 70) {
    return {
      headline:
        rhythm === null ? "Waktunya mulai latihan ritme" : "Rapiin ketepatan tempo",
      why:
        rhythm === null
          ? "Nada dan kuping lu udah jalan. Yang belum pernah diukur: ketepatan waktu gesekan. Itu bagian yang paling kedengeran sama pendengar."
          : `Rata-rata meleset terbaik lu ${rhythm} ms. Target di bawah 50 ms — di situ orang gak denger melesetnya lagi.`,
      actions: [
        { label: "⏱️ Latihan ritme", href: "/ritme" },
        { label: "🥁 Metronom", href: "/metronome" },
      ],
      notes: noteLabels,
    };
  }

  // 6. Semua dasar aman → lanjut materi level berikutnya
  const nextEx = level?.exercises.findIndex((_, i) => !done[`${level.id}:${i}`]);
  return {
    headline: level
      ? `Lanjut: ${level.title}`
      : "Semua level kelar — masuk repertoar bebas",
    why:
      level && nextEx !== undefined && nextEx >= 0
        ? `Dasar lu udah aman (intonasi, kuping, ritme semua di atas ambang). Latihan berikutnya: ${level.exercises[nextEx].label}.`
        : "Dasar aman dan kurikulum tuntas. Pilih repertoar sesuai grade di halaman silabus.",
    actions: level?.exercises[nextEx ?? 0]?.tool
      ? [
          { label: "Buka alatnya", href: level.exercises[nextEx ?? 0].tool! },
          { label: "🎵 Mode lagu", href: "/lagu" },
        ]
      : [
          { label: "🎵 Mode lagu", href: "/lagu" },
          { label: "📋 Silabus", href: "/silabus" },
        ],
    notes: noteLabels,
  };
}

export default function KurikulumPage() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    const p = loadProgress();
    setDone(p.doneExercises);
    setProgress(p);
    // buka level pertama yang belum kelar
    const firstUnfinished = CURRICULUM.find((lv) =>
      lv.exercises.some((_, i) => !p.doneExercises[`${lv.id}:${i}`])
    );
    setOpen(firstUnfinished?.id ?? CURRICULUM[0].id);
  }, []);

  // Saran latihan hari ini, disusun dari data — bukan urutan statis.
  const advice = progress ? buildAdvice(progress, done) : null;

  const toggle = (levelId: string, exIdx: number) => {
    const key = `${levelId}:${exIdx}`;
    const next = { ...done, [key]: !done[key] };
    setDone(next);
    updateProgress((p) => {
      p.doneExercises = next;
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">🗺️ Kurikulum: Nol → Paganini</h1>
        <p className="mt-1 text-sm text-muted">
          Jalur lengkap. Centang latihan yang udah lu kerjain. Jangan loncat
          level — fondasi bolong = mentok di tengah jalan.
        </p>
        <p className="mt-2 text-xs text-muted">
          Tiap level dipetakan ke grade ujian resmi edisi terbaru (ABRSM from
          2024, Trinity from 2025, Suzuki revisi) —{" "}
          <Link href="/silabus" className="text-accent-strong underline">
            lihat peta silabusnya
          </Link>
          .
        </p>
      </header>

      {/* Saran hari ini — dari catatan latihan, bukan urutan tetap. Ini yang
          bikin halaman ini beda dari daftar centang biasa. */}
      {advice && (
        <div className="animate-fade-up sweep relative overflow-hidden rounded-2xl border border-accent/50 bg-accent/10 p-5">
          <div className="text-xs uppercase tracking-wide text-muted">
            Saran latihan hari ini
          </div>
          <h2 className="mt-1 text-lg font-bold text-accent-strong">
            {advice.headline}
          </h2>
          <p className="mt-1 text-sm">{advice.why}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {advice.actions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="press rounded-full bg-accent px-4 py-2 text-xs font-semibold text-background hover:bg-accent-strong"
              >
                {a.label} →
              </Link>
            ))}
          </div>
          {advice.notes.length > 0 && (
            <p className="mt-3 rounded-lg bg-surface-2 p-2.5 text-xs text-muted">
              Nada yang paling perlu diberesin:{" "}
              <b className="text-foreground">{advice.notes.join(" · ")}</b>
            </p>
          )}
        </div>
      )}

      <ol className="space-y-3">
        {CURRICULUM.map((lv) => {
          const doneCount = lv.exercises.filter(
            (_, i) => done[`${lv.id}:${i}`]
          ).length;
          const complete = doneCount === lv.exercises.length;
          const isOpen = open === lv.id;
          return (
            <li
              key={lv.id}
              className={`rounded-xl border bg-surface transition-colors ${
                complete ? "border-good/40" : "border-border-soft"
              }`}
            >
              <button
                onClick={() => setOpen(isOpen ? null : lv.id)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span className="text-2xl">{lv.emoji}</span>
                <span className="flex-1">
                  <span className="block font-semibold">
                    {lv.title}
                    {complete && <span className="ml-2 text-good">✓ kelar</span>}
                  </span>
                  <span className="block text-sm text-muted">{lv.subtitle}</span>
                </span>
                <span className="text-xs text-muted">
                  {doneCount}/{lv.exercises.length}
                </span>
                <span className="text-muted">{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className="space-y-4 border-t border-border-soft p-4">
                  <div className="rounded-lg bg-surface-2 p-3 text-xs text-muted">
                    📏 <b className="text-foreground">Patokan dunia nyata:</b>{" "}
                    {lv.benchmark}
                  </div>
                  <div>
                    <h3 className="mb-1 text-sm font-semibold text-accent-strong">
                      Target level ini
                    </h3>
                    <ul className="list-inside list-disc space-y-1 text-sm text-muted">
                      {lv.goals.map((g) => (
                        <li key={g}>{g}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-accent-strong">
                      Latihan
                    </h3>
                    <ul className="space-y-2">
                      {lv.exercises.map((ex, i) => {
                        const key = `${lv.id}:${i}`;
                        return (
                          <li
                            key={key}
                            className="flex items-start gap-3 rounded-lg bg-surface-2 p-3"
                          >
                            <input
                              type="checkbox"
                              checked={!!done[key]}
                              onChange={() => toggle(lv.id, i)}
                              className="mt-1 h-4 w-4 accent-[var(--accent)]"
                            />
                            <div className="flex-1">
                              <div
                                className={`font-medium ${
                                  done[key] ? "text-muted line-through" : ""
                                }`}
                              >
                                {ex.label}
                              </div>
                              <div className="text-sm text-muted">
                                {ex.detail}
                              </div>
                            </div>
                            {ex.tool && (
                              <Link
                                href={ex.tool}
                                className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-background hover:bg-accent-strong"
                              >
                                buka alat →
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
