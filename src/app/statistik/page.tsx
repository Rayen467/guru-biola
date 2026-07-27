"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CURRICULUM } from "@/lib/curriculum";
import { SONGS } from "@/lib/songs";
import {
  MIN_PRACTICE_SECONDS,
  formatDuration,
  loadProgress,
  practiceSeries,
  practiceStats,
  type PracticeStats,
  type Progress,
} from "@/lib/progress";

const TARGET_SECONDS = 15 * 60;

export default function StatistikPage() {
  const [p, setP] = useState<Progress | null>(null);
  const [stats, setStats] = useState<PracticeStats | null>(null);

  useEffect(() => {
    const loaded = loadProgress();
    setP(loaded);
    setStats(practiceStats(loaded));
  }, []);

  if (!p || !stats) {
    return <div className="text-sm text-muted">Memuat catatan latihan…</div>;
  }

  const series = practiceSeries(p, 30);
  const maxSec = Math.max(TARGET_SECONDS, ...series.map((d) => d.seconds));
  const earAcc =
    p.earTraining.total > 0
      ? Math.round((p.earTraining.correct / p.earTraining.total) * 100)
      : null;
  const intoAcc =
    p.intonation.attempts > 0
      ? Math.round((p.intonation.hits / p.intonation.attempts) * 100)
      : null;
  const totalExercises = CURRICULUM.reduce((n, lv) => n + lv.exercises.length, 0);
  const doneCount = Object.values(p.doneExercises).filter(Boolean).length;
  const playedSongs = SONGS.filter((s) => p.songs[s.id]?.plays);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold">📊 Statistik Latihan</h1>
        <p className="mt-1 text-sm text-muted">
          Semua angka di sini dari latihan lu sendiri, kesimpen di browser ini
          doang. Yang dipantau: konsistensi dulu, baru kualitas.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        <Big label="Streak" value={stats.streak > 0 ? `🔥 ${stats.streak}` : "—"} sub="hari berturut" />
        <Big label="Hari ini" value={formatDuration(stats.todaySeconds)} sub={`target ${formatDuration(TARGET_SECONDS)}`} />
        <Big label="Total latihan" value={formatDuration(stats.totalSeconds)} sub={`${stats.activeDays} hari aktif`} />
        <Big
          label="Rata-rata/hari aktif"
          value={
            stats.activeDays > 0
              ? formatDuration(Math.round(stats.totalSeconds / stats.activeDays))
              : "—"
          }
          sub="hanya hari yang kehitung"
        />
      </section>

      {/* 30 hari */}
      <section className="rounded-xl border border-border-soft bg-surface p-5">
        <h2 className="text-sm font-semibold text-accent-strong">
          30 hari terakhir
        </h2>
        <div className="mt-4 flex h-28 items-end gap-1">
          {series.map((d) => {
            const h = d.seconds > 0 ? Math.max(4, (d.seconds / maxSec) * 100) : 2;
            return (
              <div
                key={d.key}
                title={`${d.key}: ${formatDuration(d.seconds)}`}
                className={`flex-1 rounded-sm ${
                  d.seconds >= TARGET_SECONDS
                    ? "bg-good"
                    : d.seconds >= MIN_PRACTICE_SECONDS
                      ? "bg-accent"
                      : d.seconds > 0
                        ? "bg-accent/40"
                        : "bg-surface-2"
                }`}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted">
          <span>{series[0].label}</span>
          <span>hari ini</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">
          <Legend className="bg-good" label={`≥ ${TARGET_SECONDS / 60} menit`} />
          <Legend className="bg-accent" label="latihan singkat" />
          <Legend className="bg-surface-2" label="libur" />
        </div>
      </section>

      {/* Kualitas */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Card
          title="👂 Latih kuping"
          rows={[
            ["Soal dijawab", String(p.earTraining.total)],
            ["Akurasi", earAcc === null ? "belum latihan" : `${earAcc}%`],
            ["Streak benar terbaik", String(p.earTraining.bestStreak)],
          ]}
          href="/kuping"
        />
        <Card
          title="🎻 Intonasi"
          rows={[
            ["Nada dicoba", String(p.intonation.attempts)],
            ["Kena", String(p.intonation.hits)],
            ["Akurasi", intoAcc === null ? "belum latihan" : `${intoAcc}%`],
          ]}
          href="/intonasi"
        />
        <Card
          title="⏱️ Ritme"
          rows={[
            ["Sesi selesai", String(p.rhythm?.rounds ?? 0)],
            [
              "Meleset rata-rata terbaik",
              p.rhythm?.bestAvgMs == null ? "belum latihan" : `${p.rhythm.bestAvgMs} ms`,
            ],
            [
              "Sesi terakhir",
              p.rhythm?.lastAvgMs == null ? "—" : `${p.rhythm.lastAvgMs} ms`,
            ],
          ]}
          href="/ritme"
        />
        <Card
          title="🗺️ Kurikulum"
          rows={[
            ["Latihan selesai", `${doneCount} / ${totalExercises}`],
            [
              "Level tuntas",
              String(
                CURRICULUM.filter((lv) =>
                  lv.exercises.every((_, i) => p.doneExercises[`${lv.id}:${i}`])
                ).length
              ),
            ],
            ["Total level", String(CURRICULUM.length)],
          ]}
          href="/kurikulum"
        />
      </section>

      {/* Lagu */}
      <section className="rounded-xl border border-border-soft bg-surface p-5">
        <h2 className="text-sm font-semibold text-accent-strong">🎵 Lagu</h2>
        {playedSongs.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Belum ada lagu yang diselesaikan.{" "}
            <Link href="/lagu" className="text-accent-strong underline">
              Mulai dari Twinkle
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {playedSongs.map((s) => {
              const rec = p.songs[s.id];
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-lg bg-surface-2 p-3"
                >
                  <span className="flex-1 text-sm">{s.title}</span>
                  <span className="text-xs text-muted">
                    {rec.plays}x main
                  </span>
                  <span className="w-24 text-right text-sm font-semibold text-accent-strong">
                    terbaik {rec.best}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted">
        Data disimpan di localStorage browser ini. Ganti browser atau hapus data
        situs = catatan hilang; gak ada server yang nyimpen apa-apa.
      </p>
    </div>
  );
}

function Big({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-border-soft bg-surface p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-accent-strong">{value}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  );
}

function Card({
  title,
  rows,
  href,
}: {
  title: string;
  rows: [string, string][];
  href: string;
}) {
  return (
    <div className="rounded-xl border border-border-soft bg-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Link href={href} className="text-xs text-accent-strong hover:underline">
          latih →
        </Link>
      </div>
      <dl className="mt-3 space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 text-sm">
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2 w-3 rounded-sm ${className}`} />
      {label}
    </span>
  );
}
