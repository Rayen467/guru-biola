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
  source.connect(analyser);

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

  return {
    stream,
    frames,
    level: () => lastLevel,
    stop: () => {
      running = false;
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
      return frames;
    },
  };
}
