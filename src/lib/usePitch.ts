"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logPractice } from "@/lib/progress";
import { ViolinDetector, type Detection } from "@/lib/detector";

export interface PitchState {
  freq: number | null;   // Hz, null kalau bukan nada biola yang meyakinkan
  clarity: number;       // 0..1 — kejernihan/periodisitas suara
  volumeDb: number;      // volume RMS dalam dB (kira-kira -100 senyap .. 0 maksimal)
  peak: number;          // puncak sampel 0..1 — deket 1 = pecah/clipping
  active: boolean;
  error: string | null;
  // Waktu (performance.now()) awal gesekan/petikan terakhir yang kedeteksi.
  // 0 = belum ada. Dipakai latihan ritme buat ngukur ketepatan waktu.
  onsetAt: number;
  // true = ada suara di atas ambang tapi bukan nada biola (ngobrol, kipas, TV).
  noisy: boolean;
  // true = lagi ngukur suara latar ruangan sebentar setelah mic nyala
  calibrating: boolean;
  noiseFloorDb: number;  // level suara latar ruangan, dB
  confidence: number;    // 0..1 — seberapa yakin ini nada biola
  harmonic: number;      // 0..1 — porsi energi di deret harmonik
  flatness: number;      // 0..1 — makin kecil makin "bernada"
  rawFreq: number;       // kandidat mentah sebelum disaring (buat diagnosa)
  reason: Detection["reason"];
}

export interface PitchOptions {
  // 0 = paling ketat (ruangan berisik), 1 = paling longgar (mic lemah).
  sensitivity?: number;
  // Nada harus bertahan berapa lama sebelum diakui. Halaman lagu/ritme butuh
  // respons cepat; tuner boleh lebih sabar demi ketenangan jarum.
  stableMs?: number;
}

const FFT_SIZE = 4096; // ~93 ms @44.1 kHz — cukup buat G3 (196 Hz)

// Ambang deteksi awal gesekan (onset) buat latihan ritme.
const ONSET_WINDOW = 1024;
const ONSET_FLOOR = 0.006;
const ONSET_RATIO = 1.7;
const ONSET_REFRACTORY_MS = 110;

const EMPTY: PitchState = {
  freq: null,
  clarity: 0,
  volumeDb: -100,
  peak: 0,
  active: false,
  error: null,
  onsetAt: 0,
  noisy: false,
  calibrating: false,
  noiseFloorDb: -100,
  confidence: 0,
  harmonic: 0,
  flatness: 1,
  rawFreq: 0,
  reason: "quiet",
};

// Hook deteksi nada dari mic. Keputusan "ini nada biola atau bukan" ada di
// ViolinDetector (lihat lib/detector.ts) — hook ini cuma ngurus mic, loop
// gambar, deteksi awal gesekan, dan catatan waktu latihan.
export function usePitch(options: PitchOptions = {}) {
  const [state, setState] = useState<PitchState>(EMPTY);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const detectorRef = useRef<ViolinDetector | null>(null);
  // sessionRef naik tiap stop/unmount: membatalkan getUserMedia yang masih
  // pending dan mematikan rAF loop lama. pendingRef nge-guard dobel-klik start.
  const sessionRef = useRef(0);
  const pendingRef = useRef(false);
  // Waktu latihan kecatat otomatis selama mic nyala — berlaku di semua halaman
  // yang pakai hook ini (tuner, intonasi, lagu, ritme), tanpa tombol timer.
  const practiceSinceRef = useRef(0);
  const flushTimerRef = useRef(0);
  const envRef = useRef(0);
  const lastOnsetRef = useRef(0);
  const startedAtRef = useRef(0);

  const optsRef = useRef(options);
  optsRef.current = options;
  useEffect(() => {
    detectorRef.current?.setSensitivity(options.sensitivity ?? 0.5);
  }, [options.sensitivity]);

  const flushPractice = useCallback(() => {
    if (!practiceSinceRef.current) return;
    const now = performance.now();
    const seconds = (now - practiceSinceRef.current) / 1000;
    practiceSinceRef.current = now;
    if (seconds >= 1) logPractice(seconds);
  }, []);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    flushPractice();
    practiceSinceRef.current = 0;
    window.clearInterval(flushTimerRef.current);
    flushTimerRef.current = 0;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    streamRef.current = null;
    detectorRef.current = null;
    setState((s) => ({ ...EMPTY, error: s.error }));
  }, [flushPractice]);

  // Balikin true kalau mic beneran nyala. Halaman yang nyalain alat lain
  // barengan (mis. metronom di /ritme) butuh tahu ini.
  const start = useCallback(async (): Promise<boolean> => {
    if (pendingRef.current || streamRef.current) return false;
    pendingRef.current = true;
    const session = sessionRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Semua pemrosesan browser dimatiin: noise suppression dirancang
          // buat suara ngomong dan bakal ngerusak timbre biola, AGC bikin
          // level naik-turun sendiri.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;

      // Bandpass sebelum analisis: buang gemuruh AC/meja (<165 Hz, di bawah
      // senar G) dan desis di atas 5 kHz. Dua highpass dirangkai karena satu
      // biji (12 dB/okt) terlalu landai buat dengung 50-120 Hz.
      const hp1 = ctx.createBiquadFilter();
      hp1.type = "highpass";
      hp1.frequency.value = 165;
      hp1.Q.value = 0.707;
      const hp2 = ctx.createBiquadFilter();
      hp2.type = "highpass";
      hp2.frequency.value = 165;
      hp2.Q.value = 0.707;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 5000;
      source.connect(hp1).connect(hp2).connect(lp).connect(analyser);

      const detector = new ViolinDetector(FFT_SIZE, {
        sampleRate: ctx.sampleRate,
        sensitivity: optsRef.current.sensitivity ?? 0.5,
        stableMs: optsRef.current.stableMs ?? 180,
      });
      const input = new Float32Array(FFT_SIZE);

      ctxRef.current = ctx;
      streamRef.current = stream;
      detectorRef.current = detector;
      practiceSinceRef.current = performance.now();
      startedAtRef.current = performance.now();
      envRef.current = 0;
      lastOnsetRef.current = 0;
      // disetor berkala, bukan cuma pas stop: kalau tab ditutup di tengah
      // latihan, yang kecatat cuma sisa <30 detik terakhir.
      flushTimerRef.current = window.setInterval(flushPractice, 30_000);
      setState({ ...EMPTY, active: true, calibrating: true });

      const loop = () => {
        if (session !== sessionRef.current) return;
        analyser.getFloatTimeDomainData(input);
        const now = performance.now();

        let peak = 0;
        for (let i = 0; i < input.length; i++) {
          const a = Math.abs(input[i]);
          if (a > peak) peak = a;
        }

        const d = detector.process(input, now);

        // Awal gesekan: lonjakan energi di jendela pendek (ekor buffer).
        let fastSq = 0;
        for (let i = input.length - ONSET_WINDOW; i < input.length; i++) {
          fastSq += input[i] * input[i];
        }
        const rmsFast = Math.sqrt(fastSq / ONSET_WINDOW);
        const env = envRef.current;
        let onsetAt = 0;
        if (
          !d.calibrating &&
          rmsFast > Math.max(ONSET_FLOOR, d.noiseFloor * 2) &&
          rmsFast > env * ONSET_RATIO &&
          now - lastOnsetRef.current > ONSET_REFRACTORY_MS
        ) {
          lastOnsetRef.current = now;
          onsetAt = now;
        }
        envRef.current = env + (rmsFast - env) * 0.2;

        const volumeDb =
          d.level > 0 ? Math.max(-100, 20 * Math.log10(d.level)) : -100;

        setState((s) => ({
          freq: d.freq,
          clarity: d.clarity,
          volumeDb,
          peak,
          active: true,
          error: null,
          onsetAt: onsetAt || s.onsetAt,
          noisy:
            !d.calibrating &&
            d.freq === null &&
            (d.reason === "noise" ||
              d.reason === "inharmonic" ||
              d.reason === "range"),
          calibrating: d.calibrating,
          noiseFloorDb: Math.max(
            -100,
            20 * Math.log10(Math.max(d.noiseFloor, 1e-5))
          ),
          confidence: d.confidence,
          harmonic: d.harmonic,
          flatness: d.flatness,
          rawFreq: d.rawFreq,
          reason: d.reason,
        }));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
      return true;
    } catch (e) {
      if (session === sessionRef.current) {
        setState({
          ...EMPTY,
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
