"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CURRICULUM } from "@/lib/curriculum";
import { loadProgress, updateProgress } from "@/lib/progress";

export default function KurikulumPage() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const p = loadProgress();
    setDone(p.doneExercises);
    // buka level pertama yang belum kelar
    const firstUnfinished = CURRICULUM.find((lv) =>
      lv.exercises.some((_, i) => !p.doneExercises[`${lv.id}:${i}`])
    );
    setOpen(firstUnfinished?.id ?? CURRICULUM[0].id);
  }, []);

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
