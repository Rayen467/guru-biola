"use client";

// Pemutar melodi dengan suara mirip biola.
//
// Kenapa perlu: hasil transkrip berupa deretan nama nada itu susah dinilai
// benar-salahnya dengan mata. Begitu didengar, sedetik juga ketahuan mana yang
// nyasar. Jadi ini bukan hiasan — ini alat pemeriksa.
//
// Suaranya dibentuk seperti dawai digesek: gelombang gergaji (kaya harmonik)
// disaring lowpass, serangannya pelan seperti bow menempel — bukan "tuk"
// seperti piano — plus vibrato tipis biar tidak terdengar seperti sirene.

export interface PlayNote {
  midi: number;
  beats: number;
}

export class MelodyPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private stopAt = 0;
  private onTick: ((index: number) => void) | null = null;
  private timers: number[] = [];

  get playing() {
    return this.ctx !== null;
  }

  play(
    notes: PlayNote[],
    bpm: number,
    opts: { onNote?: (i: number) => void; onEnd?: () => void; volume?: number } = {}
  ) {
    this.stop();
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.onTick = opts.onNote ?? null;

    const master = ctx.createGain();
    master.gain.value = opts.volume ?? 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    master.connect(lp).connect(ctx.destination);
    this.master = master;

    const beatSec = 60 / bpm;
    let t = ctx.currentTime + 0.08;

    notes.forEach((n, i) => {
      const dur = Math.max(0.12, n.beats * beatSec);
      this.voice(ctx, master, n.midi, t, dur);

      // Penanda not yang sedang berbunyi buat tampilan.
      const delayMs = Math.max(0, (t - ctx.currentTime) * 1000);
      this.timers.push(
        window.setTimeout(() => this.onTick?.(i), delayMs)
      );
      t += dur;
    });

    this.stopAt = t;
    this.timers.push(
      window.setTimeout(
        () => {
          opts.onEnd?.();
          this.stop();
        },
        Math.max(0, (t - ctx.currentTime) * 1000) + 200
      )
    );
  }

  private voice(
    ctx: AudioContext,
    dest: GainNode,
    midi: number,
    at: number,
    dur: number
  ) {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;

    // Vibrato tipis: 5,5 Hz, ±8 cent. Lebih dari itu jadi terdengar norak.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 5.5;
    lfoGain.gain.value = freq * 0.0046;
    lfo.connect(lfoGain).connect(osc.frequency);

    const body = ctx.createBiquadFilter();
    body.type = "lowpass";
    body.frequency.value = Math.min(6000, freq * 6);
    body.Q.value = 0.8;

    const g = ctx.createGain();
    // Serangan 40 ms = bow menempel, bukan dipetik.
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.9, at + 0.04);
    g.gain.setValueAtTime(0.9, at + Math.max(0.05, dur - 0.09));
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);

    osc.connect(body).connect(g).connect(dest);
    osc.start(at);
    osc.stop(at + dur + 0.05);
    lfo.start(at);
    lfo.stop(at + dur + 0.05);
  }

  stop() {
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers = [];
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.onTick = null;
    this.stopAt = 0;
    ctx?.close().catch(() => {});
  }
}

// --- Pembersih hasil transkrip ---

// Tebak tangga nada: cari pergeseran tangga nada mayor yang paling banyak
// mencakup nada-nada yang ada. Sederhana, tapi cukup untuk membuang nada
// nyasar hasil salah deteksi.
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export function guessKey(midis: number[]): number {
  let bestRoot = 0;
  let bestScore = -1;
  for (let root = 0; root < 12; root++) {
    let score = 0;
    for (const m of midis) {
      if (MAJOR.includes((((m - root) % 12) + 12) % 12)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRoot = root;
    }
  }
  return bestRoot;
}

// Geser nada yang di luar tangga nada ke nada terdekat di dalamnya.
// Nada yang meleset satu semitone hampir selalu salah deteksi, bukan not asli.
export function snapToKey(midis: number[], root: number): number[] {
  return midis.map((m) => {
    const rel = (((m - root) % 12) + 12) % 12;
    if (MAJOR.includes(rel)) return m;
    // coba turun 1, lalu naik 1
    for (const delta of [-1, 1]) {
      const relx = (((m + delta - root) % 12) + 12) % 12;
      if (MAJOR.includes(relx)) return m + delta;
    }
    return m;
  });
}

export const KEY_NAMES = [
  "C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B",
];
