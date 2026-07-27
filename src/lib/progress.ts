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

// --- Cadangan / pindah perangkat ---
// Semua catatan cuma ada di localStorage browser ini. Sekali hapus data situs
// (atau ganti HP), hilang semua. Dua fungsi ini bikin datanya bisa dibawa.

export function exportProgress(): string {
  return JSON.stringify(
    { app: "guru-biola", version: 1, exportedAt: new Date().toISOString(), progress: loadProgress() },
    null,
    2
  );
}

export function importProgress(json: string): { ok: boolean; message: string } {
  try {
    const parsed = JSON.parse(json);
    const incoming: Partial<Progress> = parsed?.progress ?? parsed;
    if (!incoming || typeof incoming !== "object") {
      return { ok: false, message: "Isinya bukan data Guru Biola." };
    }
    const merged = { ...emptyProgress(), ...incoming };
    // Digabung, bukan ditimpa: kalau di perangkat ini ada latihan yang belum
    // ada di berkasnya, jangan sampai kebuang.
    const current = loadProgress();
    merged.doneExercises = { ...current.doneExercises, ...merged.doneExercises };
    merged.practiceSeconds = { ...current.practiceSeconds };
    for (const [day, sec] of Object.entries(incoming.practiceSeconds ?? {})) {
      merged.practiceSeconds[day] = Math.max(merged.practiceSeconds[day] ?? 0, sec);
    }
    merged.earTraining = {
      correct: Math.max(current.earTraining.correct, merged.earTraining.correct),
      total: Math.max(current.earTraining.total, merged.earTraining.total),
      bestStreak: Math.max(current.earTraining.bestStreak, merged.earTraining.bestStreak),
    };
    merged.intonation = {
      hits: Math.max(current.intonation.hits, merged.intonation.hits),
      attempts: Math.max(current.intonation.attempts, merged.intonation.attempts),
    };
    saveProgress(merged);
    return { ok: true, message: "Data berhasil digabung ke perangkat ini." };
  } catch (e) {
    return { ok: false, message: "Gagal baca berkas: " + String(e) };
  }
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 1) return seconds > 0 ? "<1 menit" : "0 menit";
  if (m < 60) return `${m} menit`;
  return `${Math.floor(m / 60)} jam ${m % 60} menit`;
}
