"use client";

// Metronom presisi. Timer JS (setInterval/rAF) selalu goyang ±10-50ms — kuping
// langsung denger itu sebagai ketukan goyah. Jadi bunyinya dijadwalkan ke clock
// audio hardware (ctx.currentTime), sementara setInterval cuma tugasnya "ngintip
// ke depan" dan ngisi antrian (pola lookahead scheduler).

import { useCallback, useEffect, useRef, useState } from "react";

const LOOKAHEAD_MS = 25; // seberapa sering scheduler ngintip
const SCHEDULE_AHEAD = 0.12; // detik: jadwalkan bunyi sejauh ini ke depan
const HIDDEN_SCHEDULE_AHEAD = 2; // detik: jaga-jaga pas tab-nya ditinggal

export interface MetronomeSettings {
  bpm: number;
  beatsPerBar: number;
  subdivision: number; // 1=per ketuk, 2=duplet, 3=triol, 4=1/16
  accentFirst: boolean;
  // Pola aksen per ketukan: 2 = aksen kuat, 1 = biasa, 0 = diam.
  // Ini yang bikin metronom bisa dipakai buat pola gesekan (mis. 2 0 1 0 buat
  // latihan nada berdenyut) — bukan cuma "ketukan pertama keras".
  // Kalau panjangnya gak sama dengan beatsPerBar, sisanya dianggap 1.
  accentPattern: number[];
  volume: number; // 0..1
  silentEvery: number; // 0=mati; N=tiap bar ke-N dibisukan (latihan pulsa dalam)
  rampEvery: number; // 0=mati; naikkan tempo tiap N bar
  rampBy: number; // penambahan bpm tiap ramp
  rampMax: number; // batas atas bpm
}

export const DEFAULT_SETTINGS: MetronomeSettings = {
  bpm: 60,
  beatsPerBar: 4,
  subdivision: 1,
  accentFirst: true,
  accentPattern: [2, 1, 1, 1],
  volume: 0.7,
  silentEvery: 0,
  rampEvery: 0,
  rampBy: 4,
  rampMax: 120,
};

export const MIN_BPM = 30;
export const MAX_BPM = 240;

export interface BeatPos {
  bar: number;
  beat: number;
  sub: number;
  silent: boolean;
  bpm: number; // tempo yang benar-benar dipakai pas ketukan ini bunyi
  // Waktu ketukan ini dalam jam performance.now(), dikoreksi dari jam audio —
  // bukan waktu saat state di-set. Dipakai halaman /ritme buat ngukur seberapa
  // meleset gesekan lu dari ketukan, jadi harus setepat mungkin.
  at: number;
}

// `at` gak ikut di antrian: baru dihitung pas ketukan dikuras, dari selisih
// jam audio ke jam performance saat itu.
interface Tick extends Omit<BeatPos, "at"> {
  time: number;
}

const SETTINGS_KEY = "guru-biola-metronome";

export function loadSettings(): MetronomeSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const s = raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<MetronomeSettings>) }
      : DEFAULT_SETTINGS;
    // Setelan lama gak punya pola aksen — dibikinin dari accentFirst biar
    // pengguna lama gak tiba-tiba kehilangan aksennya.
    return { ...s, accentPattern: fitPattern(s.accentPattern, s.beatsPerBar, s.accentFirst) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Panjang pola selalu disesuaikan sama birama: kepanjangan dipotong,
// kependekan diisi ketukan biasa.
export function fitPattern(
  pattern: number[] | undefined,
  beats: number,
  accentFirst = true
): number[] {
  const out: number[] = [];
  for (let i = 0; i < beats; i++) {
    const v = pattern?.[i];
    out.push(typeof v === "number" ? v : i === 0 && accentFirst ? 2 : 1);
  }
  return out;
}

export interface TempoPreset {
  label: string;
  bpm: number;
  note: string;
}

// Patokan tempo yang kepakai di latihan biola — bukan daftar istilah Italia
// lengkap, tapi yang beneran dipakai buat ngatur latihan.
export const TEMPO_PRESETS: TempoPreset[] = [
  { label: "Larghissimo", bpm: 40, note: "Nada panjang, kontrol bow" },
  { label: "Adagio", bpm: 60, note: "Tangga nada pelan, cek intonasi" },
  { label: "Andante", bpm: 80, note: "Lagu Suzuki awal" },
  { label: "Moderato", bpm: 100, note: "Détaché rata" },
  { label: "Allegro", bpm: 130, note: "Repertoar cepat" },
  { label: "Presto", bpm: 170, note: "Uji batas — jangan dipaksa" },
];

export function saveSettings(s: MetronomeSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // localStorage penuh/diblokir — metronom tetap jalan, cuma gak keinget
  }
}

// Klik pendek: sinus + envelope curam. Beda tinggi nada buat aksen / ketuk /
// pecahan, biar kuping bisa bedain tanpa harus ngeliat layar.
function click(
  ctx: AudioContext,
  time: number,
  kind: "accent" | "beat" | "sub",
  volume: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const freq = kind === "accent" ? 1600 : kind === "beat" ? 1000 : 720;
  const amp = (kind === "accent" ? 1 : kind === "beat" ? 0.7 : 0.3) * volume;

  osc.type = "square";
  osc.frequency.value = freq;
  // filter biar square gak nusuk kuping pas latihan lama
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 3500;

  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(amp, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);

  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.06);
}

export function useMetronome(settings: MetronomeSettings) {
  const [running, setRunning] = useState(false);
  const [pos, setPos] = useState<BeatPos>({
    bar: 0,
    beat: 0,
    sub: 0,
    silent: false,
    bpm: settings.bpm,
    at: 0,
  });

  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number>(0);
  const nextTimeRef = useRef(0);
  const stepRef = useRef(0); // indeks subdivisi di dalam bar
  const barRef = useRef(0);
  const bpmRef = useRef(settings.bpm);
  const queueRef = useRef<Tick[]>([]);
  const sRef = useRef(settings);

  useEffect(() => {
    sRef.current = settings;
  }, [settings]);

  // Geser slider tempo pas lagi jalan = langsung kepakai (dan ngereset ramp).
  // Cuma nyentuh ref, gak setState: tempo yang ditampilkan diambil dari ketukan
  // terakhir yang bunyi (pos.bpm), jadi angka di layar = yang kuping denger.
  useEffect(() => {
    bpmRef.current = settings.bpm;
  }, [settings.bpm]);

  const stop = useCallback(() => {
    window.clearInterval(timerRef.current);
    timerRef.current = 0;
    queueRef.current = [];
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setRunning(false);
    setPos((p) => ({ ...p, bar: 0, beat: 0, sub: 0, silent: false }));
  }, []);

  const start = useCallback(() => {
    if (ctxRef.current) return;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    stepRef.current = 0;
    barRef.current = 0;
    queueRef.current = [];
    bpmRef.current = sRef.current.bpm;
    // mulai sedikit di depan biar ketukan pertama gak kepotong
    nextTimeRef.current = ctx.currentTime + 0.08;
    setRunning(true);

    const scheduler = () => {
      const s = sRef.current;
      const subdivision = Math.max(1, s.subdivision);
      const beats = Math.max(1, s.beatsPerBar);
      // Tab yang gak keliatan bikin setInterval di-throttle jadi ~1 detik sekali.
      // Kalau lookahead-nya tetap 120ms, ketukan bakal bolong pas metronom
      // ditinggal di tab lain — padahal itu justru cara pakainya. Jadi pas
      // hidden, jadwalin jauh ke depan; pas keliatan, balik pendek biar ubahan
      // tempo/volume langsung kerasa.
      const ahead = document.hidden ? HIDDEN_SCHEDULE_AHEAD : SCHEDULE_AHEAD;

      while (nextTimeRef.current < ctx.currentTime + ahead) {
        const stepsPerBar = beats * subdivision;
        // birama/subdivisi bisa diubah pas lagi jalan — jaga step tetap valid
        if (stepRef.current >= stepsPerBar) stepRef.current = 0;

        const beat = Math.floor(stepRef.current / subdivision);
        const sub = stepRef.current % subdivision;
        const silent =
          s.silentEvery > 0 &&
          barRef.current % s.silentEvery === s.silentEvery - 1;

        // Pola aksen: 2 = keras, 1 = biasa, 0 = ketukan ini sengaja dilewat.
        // Ketukan yang dilewat itu bukan bug — dipakai buat latihan pola
        // gesekan dan buat maksa telinga ngisi sendiri celahnya.
        const accentLevel = s.accentPattern?.[beat] ?? (beat === 0 && s.accentFirst ? 2 : 1);
        const muted = accentLevel === 0;
        if (!silent && !muted) {
          const kind =
            sub !== 0 ? "sub" : accentLevel === 2 ? "accent" : "beat";
          click(ctx, nextTimeRef.current, kind, s.volume);
        }
        queueRef.current.push({
          time: nextTimeRef.current,
          bar: barRef.current,
          beat,
          sub,
          silent,
          bpm: bpmRef.current,
        });

        nextTimeRef.current += 60 / bpmRef.current / subdivision;
        stepRef.current += 1;

        if (stepRef.current >= stepsPerBar) {
          stepRef.current = 0;
          barRef.current += 1;
          if (s.rampEvery > 0 && barRef.current % s.rampEvery === 0) {
            bpmRef.current = Math.min(s.rampMax, bpmRef.current + s.rampBy);
          }
        }
      }
    };

    // UI nyusul clock audio: tampilkan ketukan pas bunyinya bener-bener keluar,
    // bukan pas dijadwalkan (bisa 120ms lebih awal). Dijalanin dari interval yang
    // sama, bukan requestAnimationFrame — rAF berhenti total di tab tersembunyi,
    // dan antriannya bakal numpuk terus tanpa pernah dikuras.
    const drain = () => {
      const t = ctx.currentTime;
      const perfNow = performance.now();
      let latest: Tick | null = null;
      while (queueRef.current.length && queueRef.current[0].time <= t) {
        latest = queueRef.current.shift()!;
      }
      if (latest) {
        const { bar, beat, sub, silent, bpm } = latest;
        // mundurkan sebanyak jarak antara sekarang dan saat ketukan ini bunyi
        const at = perfNow - (t - latest.time) * 1000;
        setPos({ bar, beat, sub, silent, bpm, at });
      }
    };

    const tick = () => {
      scheduler();
      drain();
    };

    tick();
    timerRef.current = window.setInterval(tick, LOOKAHEAD_MS);
  }, []);

  const toggle = useCallback(() => {
    if (ctxRef.current) stop();
    else start();
  }, [start, stop]);

  useEffect(() => stop, [stop]);

  return { running, pos, start, stop, toggle };
}

// Istilah tempo klasik — biar kebiasaan baca partitur ikut kebentuk.
export function tempoTerm(bpm: number): string {
  if (bpm < 45) return "Grave / Largo — sangat lambat";
  if (bpm < 60) return "Larghetto — lambat";
  if (bpm < 72) return "Adagio — santai";
  if (bpm < 84) return "Andante — kecepatan jalan kaki";
  if (bpm < 108) return "Moderato — sedang";
  if (bpm < 132) return "Allegro — cepat & ceria";
  if (bpm < 168) return "Vivace — hidup";
  return "Presto — kenceng banget";
}
