"use client";

// Evaluasi sesi latihan.
//
// Selama mic nyala, tiap frame dikumpulin diam-diam. Pas distop, hasilnya
// diterjemahin jadi penilaian yang bisa langsung dikerjain: gesekan lu
// kepelanan, tekanan bow naik-turun, jari cenderung kerendahan, ruangan
// kebanyakan noise. Angka doang gak ngajarin apa-apa — yang dicari penyebab
// dan tindakannya.

import { useEffect, useRef, useState } from "react";
import { freqToNote } from "@/lib/notes";

export interface EvalInput {
  active: boolean;
  freq: number | null;
  volumeDb: number;
  peak: number;
  reason: string;
}

export interface Verdict {
  icon: string;
  title: string;
  detail: string;
  tone: "good" | "warn" | "bad";
}

export interface SessionReport {
  seconds: number;
  frames: number;
  detectedPct: number; // % waktu nada kebaca
  avgDb: number;
  dbSpread: number; // selisih persentil 90 dan 10 — rata atau naik-turun
  clipPct: number;
  quietPct: number;
  noisePct: number; // ditolak karena noise/suara lain
  avgCents: number | null; // rata-rata |meleset| dari nada terdekat
  bias: number | null; // + ketinggian, − kerendahan
  steadiestMs: number; // nada terpanjang yang ditahan tanpa putus
  score: number; // 0..100
  verdicts: Verdict[];
}

const QUIET_DB = -40;
const LOUD_DB = -8;
const CLIP_PEAK = 0.97;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[i];
}

export function useSessionEval(input: EvalInput) {
  const [report, setReport] = useState<SessionReport | null>(null);

  const acc = useRef({
    startedAt: 0,
    frames: 0,
    detected: 0,
    db: [] as number[],
    clip: 0,
    quiet: 0,
    noise: 0,
    cents: [] as number[],
    steadiestMs: 0,
    steadyFrom: 0,
    lastFreq: null as number | null,
  });
  const wasActive = useRef(false);

  useEffect(() => {
    const a = acc.current;
    if (input.active) {
      if (!wasActive.current) {
        // sesi baru: bersihin semuanya
        wasActive.current = true;
        a.startedAt = performance.now();
        a.frames = 0;
        a.detected = 0;
        a.db = [];
        a.clip = 0;
        a.quiet = 0;
        a.noise = 0;
        a.cents = [];
        a.steadiestMs = 0;
        a.steadyFrom = 0;
        a.lastFreq = null;
        setReport(null);
      }

      a.frames++;
      if (input.volumeDb > -100) a.db.push(input.volumeDb);
      if (input.peak > CLIP_PEAK) a.clip++;
      if (input.volumeDb < QUIET_DB) a.quiet++;
      if (input.reason === "noise" || input.reason === "timbre" || input.reason === "inharmonic") {
        a.noise++;
      }

      const now = performance.now();
      if (input.freq !== null) {
        a.detected++;
        a.cents.push(freqToNote(input.freq).cents);
        const prev = a.lastFreq;
        const sameNote =
          prev !== null && Math.abs(1200 * Math.log2(input.freq / prev)) < 60;
        if (!sameNote || a.steadyFrom === 0) a.steadyFrom = now;
        a.steadiestMs = Math.max(a.steadiestMs, now - a.steadyFrom);
        a.lastFreq = input.freq;
      } else {
        a.steadyFrom = 0;
        a.lastFreq = null;
      }
      return;
    }

    // baru saja distop → susun laporannya
    if (wasActive.current) {
      wasActive.current = false;
      const seconds = (performance.now() - a.startedAt) / 1000;
      // sesi terlalu pendek gak layak dinilai — hasilnya cuma nebak
      if (seconds < 5 || a.frames < 30) {
        setReport(null);
        return;
      }
      setReport(build(a, seconds));
    }
  }, [input.active, input.freq, input.volumeDb, input.peak, input.reason]);

  return { report, clear: () => setReport(null) };
}

function build(
  a: {
    frames: number;
    detected: number;
    db: number[];
    clip: number;
    quiet: number;
    noise: number;
    cents: number[];
    steadiestMs: number;
  },
  seconds: number
): SessionReport {
  const pct = (n: number) => Math.round((n / Math.max(1, a.frames)) * 100);
  const sortedDb = [...a.db].sort((x, y) => x - y);
  const avgDb = a.db.length
    ? Math.round(a.db.reduce((s, v) => s + v, 0) / a.db.length)
    : -100;
  const dbSpread = Math.round(percentile(sortedDb, 0.9) - percentile(sortedDb, 0.1));
  const detectedPct = pct(a.detected);
  const avgCents = a.cents.length
    ? Math.round(a.cents.reduce((s, c) => s + Math.abs(c), 0) / a.cents.length)
    : null;
  const bias = a.cents.length
    ? Math.round(a.cents.reduce((s, c) => s + c, 0) / a.cents.length)
    : null;

  const verdicts: Verdict[] = [];

  // 1. Apakah suaranya sampai ke app
  if (detectedPct < 25) {
    verdicts.push({
      icon: "🔇",
      title: "Nada jarang kebaca",
      detail:
        avgDb < QUIET_DB
          ? `Suaranya kekecilan (rata-rata ${avgDb} dB). Deketin mic ke biola (30-50 cm), atau gesek pakai berat lengan — bukan diteken jari.`
          : "Volume cukup tapi nadanya gak bertahan. Gesek satu nada panjang penuh, jangan pendek-pendek atau langsung pindah senar.",
      tone: "bad",
    });
  } else if (detectedPct < 60) {
    verdicts.push({
      icon: "🌗",
      title: `Nada kebaca ${detectedPct}% waktu`,
      detail:
        "Sebagian gesekan lu kepotong. Biasanya karena bow berhenti di ujung atau tekanan hilang pas ganti arah. Tahan bunyinya sampai betul-betul ganti arah.",
      tone: "warn",
    });
  } else {
    verdicts.push({
      icon: "✅",
      title: `Nada kebaca ${detectedPct}% waktu`,
      detail: "Bunyi lu konsisten sampai ke app. Ini modal utama.",
      tone: "good",
    });
  }

  // 2. Tekanan / volume gesekan
  if (a.clip / Math.max(1, a.frames) > 0.05) {
    verdicts.push({
      icon: "📢",
      title: "Terlalu keras sampai pecah",
      detail: `${pct(a.clip)}% waktu suaranya nabrak batas mic. Jauhin biola dari mic, atau kurangi tekanan bow — suara pecah bikin deteksi ngaco.`,
      tone: "warn",
    });
  } else if (avgDb < QUIET_DB) {
    verdicts.push({
      icon: "🔉",
      title: `Gesekan kepelanan (${avgDb} dB)`,
      detail:
        "Bow-nya kurang 'digantung' pakai berat lengan. Coba gesek lebih lambat tapi lebih berat — pelan bukan berarti tipis.",
      tone: "warn",
    });
  } else if (avgDb > LOUD_DB) {
    verdicts.push({
      icon: "🔊",
      title: `Volume tinggi (${avgDb} dB)`,
      detail: "Aman, tapi mepet batas. Kalau mulai kedengeran kasar, longgarin tekanan.",
      tone: "good",
    });
  } else {
    verdicts.push({
      icon: "🎚️",
      title: `Volume pas (${avgDb} dB)`,
      detail: "Jarak mic dan tekanan bow lu udah di titik yang enak.",
      tone: "good",
    });
  }

  // 3. Kerataan tekanan bow
  if (dbSpread > 22) {
    verdicts.push({
      icon: "🎻",
      title: `Tekanan bow naik-turun (rentang ${dbSpread} dB)`,
      detail:
        "Keras di tengah, hilang di ujung — ini ciri berat lengan gak dijaga. Latihan gesekan penuh 4 ketuk sambil dengerin: volumenya harus rata dari pangkal sampai ujung.",
      tone: "warn",
    });
  } else if (a.db.length > 0) {
    verdicts.push({
      icon: "📏",
      title: `Tekanan bow rata (rentang ${dbSpread} dB)`,
      detail: "Volume lu stabil sepanjang gesekan. Ini yang bikin bunyi kedengeran 'matang'.",
      tone: "good",
    });
  }

  // 4. Intonasi
  if (avgCents !== null && a.cents.length > 20) {
    if (avgCents <= 10) {
      verdicts.push({
        icon: "🎯",
        title: `Intonasi rapi (rata-rata ${avgCents} cent)`,
        detail: "Jari lu udah hafal tempatnya. Naikin tempo atau lanjut ke tangga nada berikutnya.",
        tone: "good",
      });
    } else {
      verdicts.push({
        icon: "📐",
        title: `Rata-rata meleset ${avgCents} cent`,
        detail:
          bias !== null && Math.abs(bias) > 8
            ? bias > 0
              ? `Cenderung KETINGGIAN (+${bias}). Geser jari mundur sedikit ke arah scroll, atau cek senarnya kekencengan.`
              : `Cenderung KERENDAHAN (${bias}). Geser jari maju sedikit ke arah jembatan.`
            : "Melesetnya acak, bukan ke satu arah — biasanya jari kurang tegas mendarat. Pelanin, tekan sampai bunyi bersih, baru lanjut.",
        tone: avgCents > 25 ? "bad" : "warn",
      });
    }
  }

  // 5. Ruangan
  if (a.noise / Math.max(1, a.frames) > 0.35) {
    verdicts.push({
      icon: "🏠",
      title: "Ruangannya rame",
      detail: `${pct(a.noise)}% waktu yang masuk mic itu suara lain (kipas/TV/orang). App-nya udah ngebuang itu semua, tapi kalau bisa matiin sumbernya, deteksi jadi lebih gesit.`,
      tone: "warn",
    });
  }

  // 6. Nada terpanjang yang ditahan
  if (a.steadiestMs > 0) {
    const sec = (a.steadiestMs / 1000).toFixed(1);
    verdicts.push({
      icon: "⏳",
      title: `Nada terpanjang ditahan ${sec} detik`,
      detail:
        a.steadiestMs >= 3000
          ? "Bagus — nada panjang stabil itu latihan bow paling dasar dan paling ngefek."
          : "Coba target 4 detik per gesekan. Bunyi harus tetap rata, jangan makin tipis di ujung.",
      tone: a.steadiestMs >= 3000 ? "good" : "warn",
    });
  }

  // Skor: dominan dari seberapa sering nada kebaca + intonasi + kerataan bow
  let score = detectedPct * 0.5;
  score += avgCents === null ? 20 : Math.max(0, 30 - avgCents);
  score += Math.max(0, 20 - Math.max(0, dbSpread - 12));
  if (a.clip / Math.max(1, a.frames) > 0.05) score -= 10;

  return {
    seconds,
    frames: a.frames,
    detectedPct,
    avgDb,
    dbSpread,
    clipPct: pct(a.clip),
    quietPct: pct(a.quiet),
    noisePct: pct(a.noise),
    avgCents,
    bias,
    steadiestMs: a.steadiestMs,
    score: Math.max(0, Math.min(100, Math.round(score))),
    verdicts,
  };
}
