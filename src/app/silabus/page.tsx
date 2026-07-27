"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BOARDS, LADDER, SUZUKI_BOOK1 } from "@/lib/silabus";
import { CURRICULUM } from "@/lib/curriculum";
import { loadProgress } from "@/lib/progress";

export default function SilabusPage() {
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDone(loadProgress().doneExercises);
  }, []);

  const levelDone = (id: string) => {
    const lv = CURRICULUM.find((l) => l.id === id);
    if (!lv) return false;
    return lv.exercises.every((_, i) => done[`${lv.id}:${i}`]);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">📋 Silabus Resmi (edisi terbaru)</h1>
        <p className="text-sm text-muted">
          Kurikulum app ini bukan karangan sendiri — dipetakan ke silabus ujian
          biola yang lagi berlaku sekarang. Jadi kalau suatu hari lu mau ikut
          ujian beneran, lu udah di jalurnya.
        </p>
      </header>

      {/* Tangga: level app ↔ grade ujian */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Level app ↔ grade ujian</h2>
        <ol className="space-y-2">
          {LADDER.map((step) => {
            const complete = step.levelIds.every(levelDone);
            return (
              <li
                key={step.levelLabel}
                className={`flex flex-wrap items-start gap-3 rounded-xl border bg-surface p-4 ${
                  complete ? "border-good/40" : "border-border-soft"
                }`}
              >
                <div className="min-w-24">
                  <div className="text-sm font-semibold">
                    {step.levelLabel}
                    {complete && <span className="ml-1 text-good">✓</span>}
                  </div>
                  <div className="text-xs text-accent-strong">{step.grade}</div>
                </div>
                <div className="flex-1 text-sm text-muted">{step.what}</div>
                {step.tool && (
                  <Link
                    href={step.tool}
                    className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs text-foreground hover:bg-border-soft"
                  >
                    latih →
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-muted">
          Centangnya ngikut{" "}
          <Link href="/kurikulum" className="text-accent-strong underline">
            kurikulum
          </Link>{" "}
          — satu level dianggap kelar kalau semua latihannya udah dicentang.
        </p>
      </section>

      {/* Papan ujian */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Silabus yang lagi berlaku</h2>
        {BOARDS.map((b) => (
          <div
            key={b.id}
            className="space-y-3 rounded-xl border border-border-soft bg-surface p-5"
          >
            <div>
              <h3 className="font-semibold text-accent-strong">{b.name}</h3>
              <div className="text-sm">{b.edition}</div>
              <div className="mt-0.5 text-xs text-muted">{b.validity}</div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-muted">
                Isi ujian
              </div>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm">
                {b.components.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>

            <ul className="space-y-1 text-xs text-muted">
              {b.notes.map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>

            <a
              href={b.url}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs text-accent-strong underline"
            >
              Buka silabus resmi ↗
            </a>
          </div>
        ))}
        <p className="rounded-lg bg-surface-2 p-3 text-xs text-muted">
          ⚠️ Daftar tangga nada lengkap per grade sengaja gak disalin ke sini —
          PDF resminya dikunci penerbitnya, dan salah hafal tangga nada ujian itu
          mahal. Ambil dari link resmi di atas.
        </p>
      </section>

      {/* Suzuki Book 1 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Suzuki Violin School Vol. 1 — urutan resmi
        </h2>
        <p className="text-sm text-muted">
          Urutan ini bukan selera; tiap lagu nambah persis satu kesulitan baru.
          Jangan diacak.
        </p>
        <ol className="grid gap-2 sm:grid-cols-2">
          {SUZUKI_BOOK1.map((p) => (
            <li
              key={p.no}
              className="flex items-center gap-3 rounded-lg border border-border-soft bg-surface p-3"
            >
              <span className="w-6 shrink-0 text-center text-sm font-bold text-muted">
                {p.no}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{p.title}</span>
                <span className="block text-xs text-muted">{p.composer}</span>
              </span>
              {p.inApp ? (
                <Link
                  href="/lagu"
                  className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-background hover:bg-accent-strong"
                >
                  ada di app
                </Link>
              ) : (
                <span className="shrink-0 text-xs text-muted">
                  {p.public ? "dari buku" : "hak cipta"}
                </span>
              )}
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted">
          Lagu bertanda &quot;hak cipta&quot; itu gubahan Shinichi Suzuki
          sendiri — masih dilindungi, jadi notasinya gak ditaruh di app. Mainkan
          dari bukunya.
        </p>
      </section>
    </div>
  );
}
