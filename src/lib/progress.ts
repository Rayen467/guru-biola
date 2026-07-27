"use client";

// Progress disimpan di localStorage. Sederhana, tanpa akun.

export interface Progress {
  doneExercises: Record<string, boolean>; // key: "levelId:exerciseIndex"
  earTraining: { correct: number; total: number; bestStreak: number };
  intonation: { attempts: number; hits: number };
  songs: Record<string, { best: number; plays: number }>; // best = akurasi %
  // Ritme: bestAvgMs = rata-rata meleset terkecil yang pernah dicapai (makin kecil makin bagus)
  rhythm: { rounds: number; bestAvgMs: number | null; lastAvgMs: number | null };
  practiceSeconds: Record<string, number>; // key: "YYYY-MM-DD" (tanggal lokal)
  lastActive: string | null;
}

const KEY = "guru-biola-progress";

// Fungsi, bukan konstanta: kalau objek kosongnya dipakai bareng, isi nested-nya
// (doneExercises dkk) bakal kebawa-bawa antar pemanggilan loadProgress.
function emptyProgress(): Progress {
  return {
    doneExercises: {},
    earTraining: { correct: 0, total: 0, bestStreak: 0 },
    intonation: { attempts: 0, hits: 0 },
    songs: {},
    rhythm: { rounds: 0, bestAvgMs: null, lastAvgMs: null },
    practiceSeconds: {},
    lastActive: null,
  };
}

export function loadProgress(): Progress {
  const empty = emptyProgress();
  if (typeof window === "undefined") return empty;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}

export function saveProgress(p: Progress) {
  p.lastActive = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function updateProgress(fn: (p: Progress) => void): Progress {
  const p = loadProgress();
  fn(p);
  saveProgress(p);
  return p;
}

// ---- Catatan latihan harian ----

// Tanggal LOKAL, bukan UTC: jam 1 pagi di sini masih harus kehitung hari kemarin
// buat user, bukan lompat ke tanggal baru versi UTC.
export function dayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayKeyAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayKey(d);
}

// Di bawah ini gak dihitung sebagai "latihan hari ini" — cegah streak nyala cuma
// gara-gara mic kebuka 3 detik.
export const MIN_PRACTICE_SECONDS = 60;

export function logPractice(seconds: number) {
  if (typeof window === "undefined" || !(seconds > 0)) return;
  updateProgress((p) => {
    const k = dayKey();
    p.practiceSeconds[k] = (p.practiceSeconds[k] ?? 0) + seconds;
  });
}

export interface PracticeStats {
  todaySeconds: number;
  streak: number; // hari berturut-turut latihan
  totalSeconds: number;
  activeDays: number;
  last7: { key: string; label: string; seconds: number }[];
}

const DAY_LABEL = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function practiceStats(p: Progress): PracticeStats {
  const secs = p.practiceSeconds ?? {};
  const todaySeconds = secs[dayKey()] ?? 0;

  // Streak: mundur dari hari ini. Hari ini yang masih kosong belum memutus
  // streak — harinya belum abis.
  let streak = 0;
  for (let i = todaySeconds >= MIN_PRACTICE_SECONDS ? 0 : 1; ; i++) {
    if ((secs[dayKeyAgo(i)] ?? 0) >= MIN_PRACTICE_SECONDS) streak++;
    else break;
  }

  const values = Object.values(secs);
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    last7.push({ key: k, label: DAY_LABEL[d.getDay()], seconds: secs[k] ?? 0 });
  }

  return {
    todaySeconds,
    streak,
    totalSeconds: values.reduce((a, b) => a + b, 0),
    activeDays: values.filter((s) => s >= MIN_PRACTICE_SECONDS).length,
    last7,
  };
}

// Deret waktu latihan n hari terakhir (hari ini paling kanan).
export function practiceSeries(
  p: Progress,
  days: number
): { key: string; label: string; seconds: number }[] {
  const secs = p.practiceSeconds ?? {};
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    out.push({
      key: k,
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      seconds: secs[k] ?? 0,
    });
  }
  return out;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 1) return seconds > 0 ? "<1 menit" : "0 menit";
  if (m < 60) return `${m} menit`;
  return `${Math.floor(m / 60)} jam ${m % 60} menit`;
}
