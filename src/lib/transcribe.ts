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
  cents: number; // simpangan dari nada pas
  // Sebaran nada DI DALAM not ini (cent). Ini penanda keyakinan yang jujur:
  // not yang sungguhan bunyi punya nada yang diam; yang sebarannya lebar
  // biasanya bukan not, cuma pelacak yang lagi bingung antara beberapa suara.
  spread: number;
  // Volume rata-rata not ini (dB RMS). Dari sini dinamika (p/mf/f) hasil
  // transkrip diambil — jadi bagian lagu yang memang direkam lembut tertulis
  // lembut, bukan ditebak.
  db: number;
}

export interface TranscribeOptions {
  // Nada di bawah G3 (55) mustahil dimainkan biola; dinaikkan per oktaf.
  liftToViolinRange?: boolean;
  minNoteMs?: number;
  onProgress?: (pct: number) => void;
  // Batas frekuensi yang dianggap "melodi". Bass dan drum di bawah 180 Hz
  // cuma bikin pelacak nada bingung; suara desis di atas 1,6 kHz juga.
  loHz?: number;
  hiHz?: number;
}

const FRAME = 2048; // ~46 ms @44.1k — cukup rapat buat nada pendek
const HOP = 512; // ~12 ms geser
// Setelah audionya disaring dulu (lihat filterBuffer), kejernihan naik sendiri
// — jadi ambang ini gak perlu digalakin. Menaikkannya tanpa menyaring audio
// justru bikin semua nada dibuang begitu ada bass ikut bunyi.
const CLARITY_MIN = 0.87;
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

// Saring audionya DULU, sebelum dianalisis.
//
// Ini pembeda terbesar pada rekaman sungguhan. Membatasi hasil deteksi saja
// tidak cukup: bass dan bass drum tetap ikut masuk ke gelombang, merusak
// bentuknya, dan pelacak nada langsung kehilangan kejernihan — akibatnya
// melodi yang jelas-jelas terdengar malah tidak terbaca sama sekali.
// Dua highpass dirangkai (12 dB/okt tiap biji) karena satu biji terlalu landai
// untuk membuang bass yang jauh lebih keras dari melodinya.
async function filterBuffer(
  buffer: AudioBuffer,
  loHz: number,
  hiHz: number
): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
  const src = off.createBufferSource();
  src.buffer = buffer;

  const hp1 = off.createBiquadFilter();
  hp1.type = "highpass";
  hp1.frequency.value = loHz;
  const hp2 = off.createBiquadFilter();
  hp2.type = "highpass";
  hp2.frequency.value = loHz;
  const lp = off.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = hiHz;

  src.connect(hp1).connect(hp2).connect(lp).connect(off.destination);
  src.start();
  return off.startRendering();
}

// Deteksi nada per frame → gabung frame yang nadanya sama jadi satu not.
export async function transcribeBuffer(
  buffer: AudioBuffer,
  opts: TranscribeOptions = {}
): Promise<RawNote[]> {
  const {
    liftToViolinRange = true,
    minNoteMs = 90,
    onProgress,
    loHz = 150,
    hiHz = 3200,
  } = opts;
  const sr = buffer.sampleRate;
  // Disaring dulu; kalau browser-nya gagal merender offline, pakai apa adanya.
  let kerja = buffer;
  try {
    kerja = await filterBuffer(buffer, loHz, hiHz);
  } catch {
    kerja = buffer;
  }
  const mono = toMono(kerja);
  const detector = PitchDetector.forFloat32Array(FRAME);
  detector.minVolumeDecibels = -55;
  const frame = new Float32Array(FRAME);

  const frames: Frame[] = [];
  const total = Math.max(1, Math.floor((mono.length - FRAME) / HOP));

  for (let i = 0, f = 0; i + FRAME < mono.length; i += HOP, f++) {
    frame.set(mono.subarray(i, i + FRAME));
    const [pitch, clarity] = detector.findPitch(frame, sr);
    const ok = clarity > CLARITY_MIN && pitch > loHz && pitch < hiHz;
    let sq = 0;
    for (let k = 0; k < FRAME; k++) sq += frame[k] * frame[k];
    const rms = Math.sqrt(sq / FRAME);
    frames.push({
      t: (i / sr) * 1000,
      midi: ok ? midiOf(pitch) : null,
      db: rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100,
    });

    // Analisis panjang bisa bikin halaman beku; kasih napas tiap 200 frame.
    if (f % 200 === 0) {
      onProgress?.(Math.min(99, Math.round((f / total) * 100)));
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(100);
  return finishFrames(frames, minNoteMs, liftToViolinRange);
}

// Tiga pembersih yang dijalankan sebelum frame digabung jadi not. Ini yang
// paling menentukan bagus-tidaknya hasil pada rekaman sungguhan.
export function finishFrames(
  frames: Frame[],
  minNoteMs = 90,
  lift = true
): RawNote[] {
  const halus = medianFilter(frames, 5);
  const offset = estimateTuningOffset(halus);
  // Rekaman jarang tepat di A=440: bisa 442, bisa kaset/vinyl yang kecepatannya
  // meleset, bisa penyanyi yang memang agak tinggi. Kalau tidak dikoreksi,
  // SEMUA not dinilai meleset padahal saling selaras satu sama lain.
  const dikoreksi = halus.map((f) => ({
    t: f.t,
    midi: f.midi === null ? null : f.midi - offset,
  }));
  return fixOctaveJumps(groupFrames(dikoreksi, minNoteMs, lift));
}

export interface Frame {
  t: number;
  midi: number | null;
  db?: number;
}

// Buang lompatan satu-dua frame. Pelacak nada sesekali salah baca satu frame;
// tanpa saringan ini, satu frame nyasar bisa memotong satu not jadi tiga.
function medianFilter(frames: Frame[], win: number): Frame[] {
  const half = Math.floor(win / 2);
  return frames.map((f, i) => {
    if (f.midi === null) return f;
    const sekitar: number[] = [];
    for (let k = Math.max(0, i - half); k <= Math.min(frames.length - 1, i + half); k++) {
      const m = frames[k].midi;
      if (m !== null) sekitar.push(m);
    }
    if (sekitar.length < 3) return f;
    sekitar.sort((a, b) => a - b);
    return { t: f.t, midi: sekitar[Math.floor(sekitar.length / 2)] };
  });
}

// Seberapa jauh keseluruhan rekaman meleset dari nada standar, dalam satuan
// semitone (mis. 0,08 = 8 cent lebih tinggi). Diambil dari MEDIAN simpangan
// semua frame terhadap nada terdekat — median tahan terhadap not-not nyasar.
export function estimateTuningOffset(frames: Frame[]): number {
  const simpangan: number[] = [];
  for (const f of frames) {
    if (f.midi === null) continue;
    const d = f.midi - Math.round(f.midi);
    simpangan.push(d);
  }
  if (simpangan.length < 20) return 0;
  simpangan.sort((a, b) => a - b);
  return simpangan[Math.floor(simpangan.length / 2)];
}

// Pelacak nada gampang salah oktaf: satu not tiba-tiba melompat 12 semitone
// padahal tetangganya di oktaf yang sama. Not seperti itu ditarik balik.
export function fixOctaveJumps(notes: RawNote[]): RawNote[] {
  if (notes.length < 3) return notes;
  const semua = notes.map((n) => n.midi).sort((a, b) => a - b);
  const tengah = semua[Math.floor(semua.length / 2)];
  return notes.map((n) => {
    let midi = n.midi;
    // Tarik ke oktaf yang paling dekat dengan pusat melodi, tapi hanya kalau
    // jaraknya memang kelipatan oktaf — jangan mengubah nada yang beneran beda.
    while (midi - tengah > 12) midi -= 12;
    while (tengah - midi > 12) midi += 12;
    return { ...n, midi };
  });
}

function median(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Gabung frame jadi not. Dipakai bareng oleh jalur berkas dan jalur mic —
// kalau ditulis dua kali, salah satunya pasti ketinggalan perbaikan.
export function groupFrames(
  frames: Frame[],
  minNoteMs = 90,
  lift = true
): RawNote[] {
  const notes: RawNote[] = [];
  let cur: {
    start: number;
    last: number;
    vals: number[];
    dbs: number[];
  } | null = null;

  const flush = (endT: number) => {
    if (!cur) return;
    const dur = endT - cur.start;
    if (dur >= minNoteMs && cur.vals.length >= 3) {
      // Median lebih tahan blip daripada rata-rata.
      const sorted = [...cur.vals].sort((a, b) => a - b);
      const mid = sorted[Math.floor(sorted.length / 2)];
      let midi = Math.round(mid);
      const cents = Math.round((mid - midi) * 100);
      // Sebaran diambil dari persentil 10-90, bukan min-max: satu frame nyasar
      // di ujung tidak boleh bikin not yang stabil kelihatan berantakan.
      const p10 = sorted[Math.floor(sorted.length * 0.1)];
      const p90 = sorted[Math.floor(sorted.length * 0.9)];
      const spread = Math.round((p90 - p10) * 100);
      if (lift) {
        while (midi < VIOLIN_LOW) midi += 12;
        while (midi > VIOLIN_HIGH) midi -= 12;
      }
      const db =
        cur.dbs.length > 0
          ? cur.dbs.reduce((a, b) => a + b, 0) / cur.dbs.length
          : -100;
      notes.push({
        midi,
        startMs: cur.start,
        durMs: dur,
        cents,
        spread,
        db: Math.round(db),
      });
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
      cur = { start: f.t, last: f.t, vals: [f.midi], dbs: [f.db ?? -100] };
      continue;
    }
    // Dibandingkan ke MEDIAN grup, bukan ke frame terakhir. Kalau dibandingkan
    // ke frame terakhir, perpindahan nada yang halus (satu langkah kecil per
    // frame) tidak pernah terdeteksi dan dua nada ikut menyatu.
    const ref = median(cur.vals.slice(-9));
    const diffCents = Math.abs((f.midi - ref) * 100);
    if (diffCents > SAME_NOTE_CENTS) {
      flush(f.t);
      cur = { start: f.t, last: f.t, vals: [f.midi], dbs: [f.db ?? -100] };
    } else {
      cur.vals.push(f.midi);
      cur.dbs.push(f.db ?? -100);
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
