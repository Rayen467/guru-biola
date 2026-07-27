"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";
import { logPractice } from "@/lib/progress";

export interface PitchState {
  freq: number | null;   // Hz, null kalau tidak ada suara jelas
  clarity: number;       // 0..1 — kejernihan/periodisitas suara
  volumeDb: number;      // volume RMS dalam dB (kira-kira -100 senyap .. 0 maksimal)
  peak: number;          // puncak sampel 0..1 — deket 1 = pecah/clipping
  active: boolean;
  error: string | null;
  // Waktu (performance.now()) awal gesekan/petikan terakhir yang kedeteksi.
  // 0 = belum ada. Dipakai latihan ritme buat ngukur ketepatan waktu.
  onsetAt: number;
}

// Ambang deteksi awal gesekan (onset).
const ONSET_WINDOW = 1024; // sampel terakhir yang dipakai (~23 ms @44.1 kHz)
const ONSET_FLOOR = 0.008; // di bawah ini dianggap senyap, bukan gesekan
const ONSET_RATIO = 1.7; // lonjakan energi dibanding envelope = gesekan baru
const ONSET_REFRACTORY_MS = 110; // jeda minimum antar onset (max ~9 nada/detik)

// Hook deteksi nada real-time dari mic. Pakai pitchy (algoritma McLeod).
export function usePitch() {
  const [state, setState] = useState<PitchState>({
    freq: null,
    clarity: 0,
    volumeDb: -100,
    peak: 0,
    active: false,
    error: null,
    onsetAt: 0,
  });
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  // sessionRef naik tiap stop/unmount: membatalkan getUserMedia yang masih
  // pending dan mematikan rAF loop lama. pendingRef nge-guard dobel-klik start.
  const sessionRef = useRef(0);
  const pendingRef = useRef(false);
  // Waktu latihan kecatat otomatis selama mic nyala — berlaku di semua halaman
  // yang pakai hook ini (tuner, intonasi, lagu), tanpa tombol timer manual.
  const practiceSinceRef = useRef(0);
  const flushTimerRef = useRef(0);
  // Deteksi awal gesekan: envelope lambat sebagai pembanding, kalau energi
  // sesaat melompat jauh di atasnya berarti gesekan/petikan baru dimulai.
  const envRef = useRef(0);
  const lastOnsetRef = useRef(0);

  const flushPractice = useCallback(() => {
    if (!practiceSinceRef.current) return;
    const now = performance.now();
    const seconds = (now - practiceSinceRef.current) / 1000;
    practiceSinceRef.current = now;
    if (seconds >= 1) logPractice(seconds);
  }, []);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    // dicatat sebelum penanda waktunya dibuang
    flushPractice();
    practiceSinceRef.current = 0;
    window.clearInterval(flushTimerRef.current);
    flushTimerRef.current = 0;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    streamRef.current = null;
    setState((s) => ({ ...s, freq: null, clarity: 0, active: false }));
  }, [flushPractice]);

  // Balikin true kalau mic beneran nyala. Halaman yang nyalain alat lain
  // barengan (mis. metronom di /ritme) butuh tahu ini — jangan sampai
  // metronomnya jalan sendirian pas izin mic ditolak.
  const start = useCallback(async (): Promise<boolean> => {
    if (pendingRef.current || streamRef.current) return false;
    pendingRef.current = true;
    const session = sessionRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (session !== sessionRef.current) {
        // keburu di-stop / pindah halaman selagi nunggu izin mic
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      // 4096 (~93ms window): akurasi jauh lebih stabil di senar rendah (G3 196 Hz)
      // dibanding 2048, latensi masih kerasa real-time.
      analyser.fftSize = 4096;
      source.connect(analyser);

      const detector = PitchDetector.forFloat32Array(analyser.fftSize);
      // -40 dB: lebih sensitif dari default biar gesekan lembut tetap kebaca;
      // umpan balik "suara kekecilan" diurus di UI lewat volumeDb.
      detector.minVolumeDecibels = -40;
      const input = new Float32Array(analyser.fftSize);

      ctxRef.current = ctx;
      streamRef.current = stream;
      practiceSinceRef.current = performance.now();
      // disetor berkala, bukan cuma pas stop: kalau tab ditutup di tengah
      // latihan, yang kecatat cuma sisa <30 detik terakhir.
      flushTimerRef.current = window.setInterval(flushPractice, 30_000);
      setState({
        freq: null,
        clarity: 0,
        volumeDb: -100,
        peak: 0,
        active: true,
        error: null,
        onsetAt: 0,
      });
      envRef.current = 0;
      lastOnsetRef.current = 0;

      const loop = () => {
        if (session !== sessionRef.current) return;
        analyser.getFloatTimeDomainData(input);
        let sumSq = 0;
        let peak = 0;
        for (let i = 0; i < input.length; i++) {
          const v = input[i];
          sumSq += v * v;
          const a = Math.abs(v);
          if (a > peak) peak = a;
        }
        const rms = Math.sqrt(sumSq / input.length);
        const volumeDb = rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100;

        // Energi jendela pendek (ekor buffer = paling baru). RMS penuh 4096
        // sampel (~93 ms) terlalu lamban buat nangkap awal gesekan.
        let fastSq = 0;
        for (let i = input.length - ONSET_WINDOW; i < input.length; i++) {
          fastSq += input[i] * input[i];
        }
        const rmsFast = Math.sqrt(fastSq / ONSET_WINDOW);
        const env = envRef.current;
        const now = performance.now();
        let onsetAt = 0;
        if (
          rmsFast > ONSET_FLOOR &&
          rmsFast > env * ONSET_RATIO &&
          now - lastOnsetRef.current > ONSET_REFRACTORY_MS
        ) {
          lastOnsetRef.current = now;
          onsetAt = now;
        }
        envRef.current = env + (rmsFast - env) * 0.2;

        const [pitch, clarity] = detector.findPitch(input, ctx.sampleRate);
        // Rentang biola kasar: G3 (196 Hz) sampai ~4 kHz. Di luar itu = noise.
        const valid = clarity > 0.9 && pitch > 150 && pitch < 4200;
        setState((s) => ({
          ...s,
          freq: valid ? pitch : null,
          clarity,
          volumeDb,
          peak,
          onsetAt: onsetAt || s.onsetAt,
        }));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
      return true;
    } catch (e) {
      if (session === sessionRef.current) {
        setState({
          freq: null,
          clarity: 0,
          volumeDb: -100,
          peak: 0,
          active: false,
          onsetAt: 0,
          error:
            e instanceof DOMException && e.name === "NotAllowedError"
              ? "Akses mic ditolak. Izinkan mic di browser dulu."
              : "Gagal akses mic: " + String(e),
        });
      }
      return false;
    } finally {
      pendingRef.current = false;
    }
  }, [flushPractice]);

  useEffect(() => stop, [stop]);

  return { ...state, start, stop };
}
