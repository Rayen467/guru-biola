"use client";

// Ubah lagu jadi deretan not yang bisa dimainkan di biola.
//
// Sumbernya dua: berkas audio milik sendiri, atau suara dari speaker (puter
// lagunya di Spotify/YouTube/apa pun, app-nya yang dengerin lewat mic).
//
// Kenapa bukan "tarik langsung dari Spotify/YouTube": audio Spotify terkunci
// DRM dan API-nya memang tidak menyediakan audio; mengunduh dari YouTube
// melanggar ketentuan layanan mereka. Mendengarkan suara yang keluar dari
// speaker itu hal yang berbeda dan sah — sama seperti orang menyalin lagu
// dengan telinga.
//
// Batas jujurnya: ini pelacak nada TUNGGAL. Melodi solo, vokal tanpa iringan
// ramai, atau lagu sederhana → bagus. Lagu band penuh dengan drum, bass, dan
// gitar berbunyi bersamaan → hasilnya berantakan, karena banyak nada bunyi di
// saat yang sama dan alat ini hanya bisa memilih satu.

import { PitchDetector } from "pitchy";

export interface RawNote {
  midi: number;
  startMs: number;
  durMs: number;
  cents: number; // rata-rata simpangan dari nada pas — penanda seberapa yakin
}

export interface TranscribeOptions {
  // Nada di bawah G3 (55) mustahil dimainkan biola; dinaikkan per oktaf.
  liftToViolinRange?: boolean;
  minNoteMs?: number;
  onProgress?: (pct: number) => void;
}

const FRAME = 2048; // ~46 ms @44.1k — cukup rapat buat nada pendek
const HOP = 512; // ~12 ms geser
const CLARITY_MIN = 0.86;
const SAME_NOTE_CENTS = 55;

export const VIOLIN_LOW = 55; // G3
export const VIOLIN_HIGH = 100; // E7, batas atas masuk akal

function midiOf(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

// Ambil satu kanal mono, dirata-rata kalau stereo.
function toMono(buffer: AudioBuffer): Float32Array {
  const n = buffer.length;
  const out = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i];
  }
  if (buffer.numberOfChannels > 1) {
    for (let i = 0; i < n; i++) out[i] /= buffer.numberOfChannels;
  }
  return out;
}

// Deteksi nada per frame → gabung frame yang nadanya sama jadi satu not.
export async function transcribeBuffer(
  buffer: AudioBuffer,
  opts: TranscribeOptions = {}
): Promise<RawNote[]> {
  const { liftToViolinRange = true, minNoteMs = 90, onProgress } = opts;
  const sr = buffer.sampleRate;
  const mono = toMono(buffer);
  const detector = PitchDetector.forFloat32Array(FRAME);
  detector.minVolumeDecibels = -55;
  const frame = new Float32Array(FRAME);

  const frames: { t: number; midi: number | null }[] = [];
  const total = Math.max(1, Math.floor((mono.length - FRAME) / HOP));

  for (let i = 0, f = 0; i + FRAME < mono.length; i += HOP, f++) {
    frame.set(mono.subarray(i, i + FRAME));
    const [pitch, clarity] = detector.findPitch(frame, sr);
    const ok = clarity > CLARITY_MIN && pitch > 60 && pitch < 3000;
    frames.push({ t: (i / sr) * 1000, midi: ok ? midiOf(pitch) : null });

    // Analisis panjang bisa bikin halaman beku; kasih napas tiap 200 frame.
    if (f % 200 === 0) {
      onProgress?.(Math.min(99, Math.round((f / total) * 100)));
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(100);
  return groupFrames(frames, minNoteMs, liftToViolinRange);
}

function median(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Gabung frame jadi not. Dipakai bareng oleh jalur berkas dan jalur mic —
// kalau ditulis dua kali, salah satunya pasti ketinggalan perbaikan.
export function groupFrames(
  frames: { t: number; midi: number | null }[],
  minNoteMs = 90,
  lift = true
): RawNote[] {
  const notes: RawNote[] = [];
  let cur: { start: number; last: number; vals: number[] } | null = null;

  const flush = (endT: number) => {
    if (!cur) return;
    const dur = endT - cur.start;
    if (dur >= minNoteMs && cur.vals.length >= 3) {
      // Median lebih tahan blip daripada rata-rata.
      const sorted = [...cur.vals].sort((a, b) => a - b);
      const mid = sorted[Math.floor(sorted.length / 2)];
      let midi = Math.round(mid);
      const cents = Math.round((mid - midi) * 100);
      if (lift) {
        while (midi < VIOLIN_LOW) midi += 12;
        while (midi > VIOLIN_HIGH) midi -= 12;
      }
      notes.push({ midi, startMs: cur.start, durMs: dur, cents });
    }
    cur = null;
  };

  for (const f of frames) {
    if (f.midi === null) {
      // Senyap sesaat (antar gesekan) tidak langsung memotong not.
      if (cur && f.t - cur.last > 120) flush(cur.last);
      continue;
    }
    if (!cur) {
      cur = { start: f.t, last: f.t, vals: [f.midi] };
      continue;
    }
    // Dibandingkan ke MEDIAN grup, bukan ke frame terakhir. Kalau dibandingkan
    // ke frame terakhir, perpindahan nada yang halus (satu langkah kecil per
    // frame) tidak pernah terdeteksi dan dua nada ikut menyatu.
    const ref = median(cur.vals.slice(-9));
    const diffCents = Math.abs((f.midi - ref) * 100);
    if (diffCents > SAME_NOTE_CENTS) {
      flush(f.t);
      cur = { start: f.t, last: f.t, vals: [f.midi] };
    } else {
      cur.vals.push(f.midi);
      cur.last = f.t;
    }
  }
  if (cur) flush(cur.last);
  return notes;
}

// Tebak tempo dari jarak antar awal not. Bukan pelacak beat sungguhan —
// cukup buat menyarankan BPM yang masuk akal, sisanya biar user yang atur.
export function guessBpm(notes: RawNote[]): number {
  if (notes.length < 4) return 90;
  const gaps: number[] = [];
  for (let i = 1; i < notes.length; i++) {
    const g = notes[i].startMs - notes[i - 1].startMs;
    if (g > 90 && g < 2000) gaps.push(g);
  }
  if (gaps.length < 3) return 90;
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  let bpm = 60000 / median;
  // Bawa ke rentang yang wajar dibaca manusia.
  while (bpm < 50) bpm *= 2;
  while (bpm > 200) bpm /= 2;
  return Math.round(bpm);
}

// Bulatkan durasi ke pecahan ketukan terdekat supaya bisa dilatih dengan
// metronom. Tanpa ini, notasinya penuh angka aneh yang tidak bisa dibaca.
export function quantize(notes: RawNote[], bpm: number): { midi: number; beats: number }[] {
  const beatMs = 60000 / bpm;
  const grid = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
  return notes.map((n) => {
    const raw = n.durMs / beatMs;
    let best = grid[0];
    for (const g of grid) {
      if (Math.abs(g - raw) < Math.abs(best - raw)) best = g;
    }
    return { midi: n.midi, beats: best };
  });
}
