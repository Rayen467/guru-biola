"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CURRICULUM } from "@/lib/curriculum";
import {
  formatDuration,
  loadProgress,
  practiceStats,
  type PracticeStats,
  type Progress,
} from "@/lib/progress";

const DAILY_TARGET_SECONDS = 15 * 60; // 15 menit/hari — target minimum yang realistis

export default function Home() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [stats, setStats] = useState<PracticeStats | null>(null);
  useEffect(() => {
    const p = loadProgress();
    setProgress(p);
    setStats(practiceStats(p));
  }, []);

  const totalExercises = CURRICULUM.reduce(
    (n, lv) => n + lv.exercises.length,
    0
  );
  const doneCount = progress
    ? Object.values(progress.doneExercises).filter(Boolean).length
    : 0;
  const earAcc =
    progress && progress.earTraining.total > 0
      ? Math.round(
          (progress.earTraining.correct / progress.earTraining.total) * 100
        )
      : null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">
          Dari nol sampai <span className="text-accent-strong">Paganini</span> 👹
        </h1>
        <p className="max-w-2xl text-muted">
          Ini guru privat biola lu. Buta nada? Gak bisa ngepasin senar? Justru
          itu kerjaan komputer — komputer gak pernah buta nada. Lu tinggal
          latihan, app ini yang jadi wasit.
        </p>
      </header>

      <PracticeCard stats={stats} />

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Latihan selesai" value={`${doneCount} / ${totalExercises}`} />
        <Stat
          label="Akurasi kuping"
          value={earAcc === null ? "belum latihan" : `${earAcc}%`}
        />
        <Stat
          label="Intonasi kena"
          value={
            progress && progress.intonation.attempts > 0
              ? `${progress.intonation.hits} / ${progress.intonation.attempts}`
              : "belum latihan"
          }
        />
      </section>

      {/* Satu tombol buat yang bingung mulai dari mana */}
      <Link
        href="/latihan"
        className="flex items-center gap-4 rounded-2xl border border-accent/50 bg-accent/10 p-5 transition-colors hover:bg-accent/20"
      >
        <span className="text-4xl">🗓️</span>
        <span className="flex-1">
          <span className="block text-lg font-bold text-accent-strong">
            Mulai sesi latihan terpandu
          </span>
          <span className="block text-sm text-muted">
            Bingung mulai dari mana? Pilih 7 / 15 / 30 menit — app yang mimpin
            urutannya, di akhir dapat analisis dari catatan latihan yang beneran
            nambah.
          </span>
        </span>
        <span className="text-2xl text-accent-strong">→</span>
      </Link>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">🎧 Latihan dengan mic — dinilai real-time</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card href="/tuner" step="mic" title="Tuner" desc="Stem gesek atau petik. Auto-deteksi senar, kalibrasi A4, anti-noise." emoji="🎯" />
          <Card href="/intonasi" step="mic" title="Intonasi" desc="Nada target + drone. Tangga nada & arpeggio ABRSM Grade 1." emoji="🎻" />
          <Card href="/kuping" step="latihan" title="Latih Kuping" desc="Interval adaptif 5 level + analisis mentok di lebar berapa." emoji="👂" />
          <Card href="/ritme" step="mic" title="Ritme" desc="Gesek per ketukan, diukur meleset berapa milidetik." emoji="⏱️" />
          <Card href="/notasi" step="mic" title="Baca Not" desc="Not di paranada, lu mainkan. Bekal sight-reading ujian." emoji="🎼" />
          <Card href="/lagu" step="mic" title="Mode Lagu" desc="Karaoke-biola: nada maju cuma kalau bener." emoji="🎵" />
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">📷 Latihan dengan kamera</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card href="/postur" step="kamera" title="Postur" desc="Kuda-kuda, bahu, scroll, kelurusan bow — dicek dari video." emoji="🧍" />
          <Card href="/bow/kamera" step="kamera" title="Cek Pegangan Bow" desc="Sudut jempol & kelingking diukur langsung + drill push-up." emoji="📷" />
          <Card href="/bow" step="teori" title="Teori Bow" desc="3 mazhab pegangan, 6 langkah, 8 teknik gesekan." emoji="🏹" />
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">🧭 Alat & arah</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card href="/metronome" step="alat" title="Metronom" desc="Presisi clock audio. Bar hening + tempo naik otomatis." emoji="🥁" />
          <Card href="/rekam" step="alat" title="Rekam & Bedah" desc="Grafik intonasi per milidetik + nada yang paling sering fals." emoji="⏺️" />
          <Card href="/fingerboard" step="alat" title="Fingerboard" desc="Peta posisi 1, klik buat dengar nadanya." emoji="🖐️" />
          <Card href="/kurikulum" step="arah" title="Kurikulum" desc="10 level sampai Paganini, patokan ABRSM/Suzuki tiap level." emoji="🗺️" />
          <Card href="/pencapaian" step="arah" title="Pencapaian" desc="Streak, 13 lencana, misi harian, kartu pamer progres." emoji="🏅" />
          <Card href="/statistik" step="arah" title="Statistik" desc="Riwayat 30 hari + cadangan buat pindah perangkat." emoji="📊" />
        </ol>
      </section>

      <section className="rounded-xl border border-border-soft bg-surface p-5">
        <h2 className="mb-1 text-xl font-semibold">🧑‍🏫 Bingung? Tanya Guru AI</h2>
        <p className="mb-3 text-sm text-muted">
          Guru AI tahu progress lu dan kurikulumnya. Tanya apa aja: cara pegang
          bow, kenapa suara berdecit, harus latihan apa hari ini.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/guru"
            className="inline-block rounded-full bg-accent px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-strong"
          >
            Buka ruang guru →
          </Link>
          <Link
            href="/silabus"
            className="inline-block rounded-full bg-surface-2 px-4 py-2 text-sm text-foreground transition-colors hover:bg-border-soft"
          >
            📋 Peta silabus ujian resmi
          </Link>
        </div>
      </section>
    </div>
  );
}

// Waktu latihan kecatat otomatis tiap mic nyala (tuner/intonasi/lagu).
function PracticeCard({ stats }: { stats: PracticeStats | null }) {
  const today = stats?.todaySeconds ?? 0;
  const pct = Math.min(100, (today / DAILY_TARGET_SECONDS) * 100);
  const done = today >= DAILY_TARGET_SECONDS;
  const streak = stats?.streak ?? 0;
  const maxWeek = Math.max(DAILY_TARGET_SECONDS, ...(stats?.last7 ?? []).map((d) => d.seconds));

  return (
    <section className="rounded-xl border border-border-soft bg-surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">
            Latihan hari ini
          </div>
          <div className="mt-1 text-3xl font-bold text-accent-strong">
            {formatDuration(today)}
            <span className="ml-2 text-sm font-normal text-muted">
              / target 15 menit
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">
            {streak > 0 ? `🔥 ${streak} hari` : "🌱 mulai hari ini"}
          </div>
          <div className="text-xs text-muted">
            {streak > 0 ? "streak berturut-turut" : "belum ada streak jalan"}
          </div>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full transition-all ${done ? "bg-good" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-4 flex items-end justify-between gap-2">
        {(stats?.last7 ?? []).map((d, i) => {
          const h = d.seconds > 0 ? Math.max(6, (d.seconds / maxWeek) * 44) : 3;
          const isToday = i === 6;
          return (
            <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
              <div
                title={`${d.key}: ${formatDuration(d.seconds)}`}
                className={`w-full rounded-sm ${
                  d.seconds >= DAILY_TARGET_SECONDS
                    ? "bg-good"
                    : d.seconds > 0
                      ? "bg-accent"
                      : "bg-surface-2"
                }`}
                style={{ height: `${h}px` }}
              />
              <span
                className={`text-[10px] ${isToday ? "text-foreground" : "text-muted"}`}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted">
        Kecatat otomatis selama mic nyala di tuner, intonasi, atau mode lagu.
        {stats && stats.totalSeconds > 0 && (
          <> Total sejauh ini: {formatDuration(stats.totalSeconds)} dalam {stats.activeDays} hari.</>
        )}
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-soft bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold text-accent-strong">{value}</div>
    </div>
  );
}

function Card({
  href,
  step,
  title,
  desc,
  emoji,
}: {
  href: string;
  step: string;
  title: string;
  desc: string;
  emoji: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block h-full rounded-xl border border-border-soft bg-surface p-4 transition-colors hover:border-accent"
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-2xl">{emoji}</span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
            langkah {step}
          </span>
        </div>
        <div className="font-semibold">{title}</div>
        <div className="mt-1 text-sm text-muted">{desc}</div>
      </Link>
    </li>
  );
}
