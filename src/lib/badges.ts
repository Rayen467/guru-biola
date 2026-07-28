"use client";

// Lencana & misi harian.
//
// Semua dihitung dari data latihan yang MEMANG udah kecatat — gak ada angka
// hiburan. Lencana yang gampang dapet tanpa latihan itu cuma bikin grafiknya
// bagus, bukan main biolanya.

import { CURRICULUM } from "@/lib/curriculum";
import {
  MIN_PRACTICE_SECONDS,
  practiceStats,
  type Progress,
} from "@/lib/progress";

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  earned: boolean;
  progress: number; // 0..1 buat yang belum kelar
  hint: string; // apa yang kurang
}

export const DAILY_TARGET_SECONDS = 15 * 60;

export function badges(p: Progress): Badge[] {
  const stats = practiceStats(p);
  const doneEx = Object.values(p.doneExercises).filter(Boolean).length;
  const songsFinished = Object.values(p.songs).filter((s) => s.plays > 0).length;
  const bestSong = Math.max(0, ...Object.values(p.songs).map((s) => s.best));
  const earAcc =
    p.earTraining.total >= 20
      ? p.earTraining.correct / p.earTraining.total
      : 0;
  const intoAcc =
    p.intonation.attempts >= 20 ? p.intonation.hits / p.intonation.attempts : 0;
  const rhythmBest = p.rhythm?.bestAvgMs ?? null;
  const levelsDone = CURRICULUM.filter((lv) =>
    lv.exercises.every((_, i) => p.doneExercises[`${lv.id}:${i}`])
  ).length;

  const mk = (
    id: string,
    emoji: string,
    title: string,
    desc: string,
    value: number,
    target: number,
    hint: string
  ): Badge => ({
    id,
    emoji,
    title,
    desc,
    earned: value >= target,
    progress: Math.min(1, target > 0 ? value / target : 0),
    hint,
  });

  return [
    mk("first-day", "🌱", "Hari pertama", "Latihan pertama kecatat.", stats.activeDays, 1, "Nyalain mic dan latihan minimal 1 menit."),
    mk("streak-3", "🔥", "Tiga hari berturut", "Streak 3 hari.", stats.streak, 3, `Streak sekarang ${stats.streak} hari.`),
    mk("streak-7", "🔥", "Seminggu penuh", "Streak 7 hari — ini titik di mana tangan mulai inget sendiri.", stats.streak, 7, `Streak sekarang ${stats.streak} hari.`),
    mk("streak-30", "👑", "Sebulan tanpa bolong", "Streak 30 hari.", stats.streak, 30, `Streak sekarang ${stats.streak} hari.`),
    mk("hour-1", "⏳", "Satu jam total", "Total latihan 1 jam.", stats.totalSeconds, 3600, "Kumpulin jam terbang."),
    mk("hour-10", "🏋️", "Sepuluh jam", "Total latihan 10 jam.", stats.totalSeconds, 36000, "Kumpulin jam terbang."),
    mk("ear-80", "👂", "Kuping kebentuk", "Akurasi ear training ≥ 80% (min. 20 soal).", earAcc, 0.8, "Latihan di menu Latih Kuping."),
    mk("intonation-75", "🎯", "Jari mulai hafal", "Akurasi intonasi ≥ 75% (min. 20 percobaan).", intoAcc, 0.75, "Latihan di menu Intonasi."),
    mk("rhythm-50", "⏱️", "Tempo rapi", "Rata-rata meleset ritme di bawah 50 ms.", rhythmBest === null ? 0 : Math.max(0, 100 - rhythmBest), 50, "Selesaikan sesi di menu Ritme."),
    mk("song-first", "🎵", "Lagu pertama", "Satu lagu tuntas di mode lagu.", songsFinished, 1, "Selesaikan Twinkle di menu Lagu."),
    mk("song-90", "🌟", "Lagu bersih", "Skor lagu terbaik ≥ 90%.", bestSong, 90, `Terbaik sekarang ${bestSong}%.`),
    mk("level-3", "🗺️", "Tiga level tuntas", "Tiga level kurikulum kelar.", levelsDone, 3, `Baru ${levelsDone} level tuntas.`),
    mk("exercise-20", "✅", "Dua puluh latihan", "20 latihan kurikulum dicentang.", doneEx, 20, `Baru ${doneEx} latihan.`),
  ];
}

export interface Quest {
  id: string;
  label: string;
  done: boolean;
  href: string;
}

// Misi hari ini — bukan daftar keinginan, tapi rutinitas yang emang disaranin
// buat pemula: stem, intonasi, kuping, tempo.
export function dailyQuests(p: Progress, todaySeconds: number): Quest[] {
  const today = new Date().toDateString();
  const touchedToday = (iso: string | null) =>
    iso !== null && new Date(iso).toDateString() === today;

  return [
    {
      id: "practice",
      label: `Latihan ${Math.round(DAILY_TARGET_SECONDS / 60)} menit`,
      done: todaySeconds >= DAILY_TARGET_SECONDS,
      href: "/intonasi",
    },
    {
      id: "warmup",
      label: "Stem dulu sebelum main",
      done: todaySeconds > 0,
      href: "/tuner",
    },
    {
      id: "ear",
      label: "Latih kuping (min. 10 soal)",
      done: p.earTraining.total >= 10 && touchedToday(p.lastActive),
      href: "/kuping",
    },
    {
      id: "rhythm",
      label: "Satu sesi ritme",
      done: (p.rhythm?.rounds ?? 0) > 0 && touchedToday(p.lastActive),
      href: "/ritme",
    },
  ];
}

export function levelFromSeconds(totalSeconds: number): {
  level: number;
  title: string;
  intoLevel: number; // 0..1 progres ke level berikutnya
  nextAt: number; // detik
} {
  // Tiap level butuh 30 menit lebih banyak dari level sebelumnya.
  const TITLES = [
    "Baru pegang biola",
    "Murid baru",
    "Pemula serius",
    "Penggesek rutin",
    "Anak Suzuki",
    "Pemain lagu",
    "Tukang tangga nada",
    "Pemain posisi 3",
    "Pemain repertoar",
    "Calon Paganini",
  ];
  let level = 0;
  let need = 1800;
  let acc = 0;
  while (totalSeconds >= acc + need && level < TITLES.length - 1) {
    acc += need;
    need += 1800;
    level++;
  }
  return {
    level: level + 1,
    title: TITLES[level],
    intoLevel: Math.min(1, (totalSeconds - acc) / need),
    nextAt: acc + need,
  };
}

export function earnedCount(p: Progress): { earned: number; total: number } {
  const list = badges(p);
  return { earned: list.filter((b) => b.earned).length, total: list.length };
}

export { MIN_PRACTICE_SECONDS };
