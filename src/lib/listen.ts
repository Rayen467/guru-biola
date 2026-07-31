"use client";

// Penangkap nada untuk MUSIK APA PUN — beda dari usePitch.
//
// usePitch sengaja galak: dia menolak apa pun yang timbrenya bukan dawai
// digesek. Itu benar untuk tuner dan latihan, tapi salah total untuk
// menyalin lagu: vokal, piano, gitar, dan synth semuanya akan dibuang.
// Di sini dipakai pelacak nada polos — yang penting periodik dan cukup
// keras, apa pun sumbernya.
//
// Sumbernya bisa mic (lagu diputar lewat speaker) atau audio tab browser
// (Spotify/YouTube yang sedang diputar). Yang dari tab jauh lebih bersih:
// tidak lewat udara, tidak kena gema ruangan, tidak kena suara sekitar.

import { PitchDetector } from "pitchy";

const FRAME = 2048;
const CLARITY_MIN = 0.85;

export interface Frame {
  t: number; // ms sejak mulai
  midi: number | null;
}

export interface Listener {
  stream: MediaStream;
  frames: Frame[];
  stop: () => Frame[];
  level: () => number; // 0..1, buat meteran di layar
  // Rekaman mentah selama mendengar. Ini yang dipakai untuk hasil akhir —
  // baca panjang lebar kenapa di komentar rekaman di bawah.
  rekaman: () => Promise<Blob | null>;
}

// Minta izin berbagi audio TAB. Spesifikasi mewajibkan video ikut diminta,
// jadi trek videonya langsung dimatikan begitu didapat — kita cuma butuh suara.
export async function captureTabAudio(): Promise<MediaStream> {
  const md = navigator.mediaDevices as MediaDevices & {
    getDisplayMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  };
  if (!md.getDisplayMedia) {
    throw new Error(
      "Browser ini gak bisa ngambil audio tab. Pakai Chrome/Edge/Brave di komputer — di HP fitur ini emang gak ada."
    );
  }
  const stream = await md.getDisplayMedia({ video: true, audio: true });
  stream.getVideoTracks().forEach((t) => t.stop());
  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error(
      "Tab-nya kebagi tapi TANPA suara. Pas milih tab, centang dulu kotak 'Also share tab audio' di pojok kiri bawah kotak dialognya."
    );
  }
  return stream;
}

export async function captureMic(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
}

// Mulai mengumpulkan nada dari sebuah stream sampai dihentikan.
export function listenFrames(stream: MediaStream): Listener {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FRAME;

  // Saring sebelum dianalisis — sama seperti jalur berkas. Tanpa ini, bass dan
  // bass drum merusak bentuk gelombang dan melodi yang jelas terdengar malah
  // tidak terbaca sama sekali.
  const hp1 = ctx.createBiquadFilter();
  hp1.type = "highpass";
  hp1.frequency.value = 170;
  const hp2 = ctx.createBiquadFilter();
  hp2.type = "highpass";
  hp2.frequency.value = 170;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  // 3,2 kHz, bukan 2 kHz: harmonik ke-3 harus ikut lolos, kalau tidak pelacak
  // nada gampang salah tebak ke nada satu kuint di bawahnya.
  lp.frequency.value = 3200;
  source.connect(hp1).connect(hp2).connect(lp).connect(analyser);

  // === Rekaman: inilah sumber hasil yang sebenarnya ===
  //
  // Loop di bawah digerakkan requestAnimationFrame, dan browser MENGHENTIKAN
  // rAF sepenuhnya begitu tabnya tidak kelihatan. Untuk mode tab, itu fatal:
  // lagunya kan diputar di tab Spotify/YouTube, artinya tab aplikasi ini pasti
  // ditinggal — dan selama ditinggal, tidak ada satu pun nada yang dianalisis.
  // Gejalanya persis seperti yang dilaporkan: seolah semuanya baru terbaca
  // setelah balik ke tab ini, dan pencacahnya meloncat ke ribuan (itu cuma rAF
  // jalan lagi 60×/detik, 1000 frame ≈ 17 detik).
  //
  // MediaRecorder tidak ikut dibekukan — dia bagian dari pipa media, bukan
  // penggambar layar. Jadi audionya direkam utuh, lalu dianalisis sesudah
  // berhenti. Untung sampingannya: analisis pasca-rekam boleh pakai mesin AI
  // yang butuh seluruh audio sekaligus, jadi hasilnya malah lebih akurat.
  //
  // Loop rAF tetap ada, tapi tugasnya turun jadi cuma penggerak meteran dan
  // pratinjau di layar. Kalau beku saat tab ditinggal, tidak ada yang hilang.
  const potongan: Blob[] = [];
  let recorder: MediaRecorder | null = null;
  try {
    recorder = new MediaRecorder(new MediaStream(stream.getAudioTracks()));
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) potongan.push(e.data);
    };
    recorder.start(1000);
  } catch {
    // Browser tanpa MediaRecorder: mundur ke hasil dari loop layar saja.
    recorder = null;
  }

  const detector = PitchDetector.forFloat32Array(FRAME);
  detector.minVolumeDecibels = -55;
  const buf = new Float32Array(FRAME);
  const frames: Frame[] = [];
  const started = performance.now();
  let raf = 0;
  let lastLevel = 0;
  let running = true;

  const loop = () => {
    if (!running) return;
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    lastLevel = Math.min(1, rms * 6);

    const [pitch, clarity] = detector.findPitch(buf, ctx.sampleRate);
    const ok = clarity > CLARITY_MIN && pitch > 60 && pitch < 3000;
    frames.push({
      t: performance.now() - started,
      midi: ok ? 69 + 12 * Math.log2(pitch / 440) : null,
    });
    raf = requestAnimationFrame(loop);
  };
  loop();

  // Menunggu potongan terakhir keluar sebelum menyerahkan rekamannya. Tanpa ini
  // detik-detik penghabisan lagu ikut hilang.
  const selesaiRekam = new Promise<void>((resolve) => {
    if (!recorder) return resolve();
    recorder.onstop = () => resolve();
  });

  return {
    stream,
    frames,
    level: () => lastLevel,
    rekaman: async () => {
      await selesaiRekam;
      if (potongan.length === 0) return null;
      return new Blob(potongan, { type: potongan[0].type || "audio/webm" });
    },
    stop: () => {
      running = false;
      cancelAnimationFrame(raf);
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
      return frames;
    },
  };
}
