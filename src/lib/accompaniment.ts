"use client";

// Iringan sederhana buat main duet: bas + akor dipetik, dijadwalkan ke jam
// audio (bukan setInterval) supaya tidak goyang.
//
// Akornya ditebak dari melodinya sendiri: nada yang paling sering muncul di
// satu bar dianggap nada dasar, lalu dibentuk triad mayor. Ini tebakan kasar
// dan sengaja begitu — menebak harmoni dengan benar butuh analisis tonal yang
// jauh lebih berat, sementara buat lagu latihan pemula (Twinkle, tangga nada,
// lagu Suzuki awal) tebakan ini hampir selalu kedengaran pas. Kalau salah,
// pemakainya bisa matikan iringan akor dan biarkan bas saja.

export interface ChordPlan {
  bar: number;
  root: number; // MIDI nada dasar, dioktafkan ke wilayah rendah
}

// Kelas nada mana yang paling banyak muncul di deretan not.
function dominantPitchClass(midis: number[]): number {
  const count = new Array(12).fill(0);
  for (const m of midis) count[((m % 12) + 12) % 12]++;
  let best = 0;
  for (let i = 1; i < 12; i++) if (count[i] > count[best]) best = i;
  return best;
}

// Bagi melodi jadi bar (beats per bar) lalu tebak akor tiap bar.
export function planChords(
  notes: { midi: number; beats: number }[],
  beatsPerBar: number
): ChordPlan[] {
  const plans: ChordPlan[] = [];
  let bar = 0;
  let acc = 0;
  let bucket: number[] = [];

  for (const n of notes) {
    bucket.push(n.midi);
    acc += n.beats;
    while (acc >= beatsPerBar) {
      const pc = dominantPitchClass(bucket);
      // Bas ditaruh di oktaf rendah (sekitar C2–B2) supaya tidak bertabrakan
      // dengan wilayah biola dan tidak mengacaukan deteksi nada.
      plans.push({ bar, root: 36 + pc });
      bar++;
      acc -= beatsPerBar;
      bucket = [];
    }
  }
  if (bucket.length) plans.push({ bar, root: 36 + dominantPitchClass(bucket) });
  return plans;
}

// Nada-nada yang sedang dibunyikan iringan pada satu bar. Dipakai halaman duet
// untuk MENGABAIKAN pantulan suaranya sendiri dari speaker.
export function chordTones(root: number): number[] {
  return [root, root + 7, root + 12, root + 16, root + 19]; // bas, kuint, oktaf, terts, kuint atas
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

export class Accompanist {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Voice[] = [];

  get running() {
    return this.ctx !== null;
  }

  start(volume: number) {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = volume;
    // Lowpass: iringan sengaja dibikin gelap dan tidak menonjol, supaya yang
    // paling terdengar tetap biolanya sendiri.
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    this.master.connect(lp).connect(this.ctx.destination);
  }

  setVolume(v: number) {
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  // Satu petikan pendek. `when` dalam detik jam audio; 0 = sekarang.
  pluck(midi: number, when = 0, dur = 0.45, gain = 0.5) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = when || ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    this.voices.push({ osc, gain: g });
    if (this.voices.length > 24) this.voices.shift();
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  stop() {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.voices = [];
    ctx?.close().catch(() => {});
  }
}
