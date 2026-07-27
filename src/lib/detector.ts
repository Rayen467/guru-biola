// Mesin deteksi nada biola.
//
// Kenapa bukan cuma pitchy: algoritma pitch (MPM/autokorelasi) SELALU ngasih
// jawaban, bahkan buat suara kipas atau orang ngomong — nilai "clarity"-nya
// doang gak cukup buat mutusin ini nada biola atau bukan. Jadi kandidat nada
// dari pitchy diuji lagi pakai 4 saringan:
//
//   1. Level    — sinyal harus jelas di atas suara latar ruangan (adaptif)
//   2. Flatness — spektrum noise itu rata; nada punya puncak tajam
//   3. Harmonik — biola bunyi sebagai deret f0, 2f0, 3f0…; noise dan ketokan
//                 gak punya deret itu
//   4. Stabil   — nada harus bertahan ratusan milidetik di frekuensi yang sama.
//                 Ini yang bunuh suara orang ngomong: f0 ngomong meluncur terus.
//
// File ini sengaja bebas Web Audio / React biar bisa diuji langsung di Node
// pakai sinyal buatan (lihat scripts/test-detector.mjs).

import { PitchDetector } from "pitchy";

export interface DetectorOptions {
  sampleRate: number;
  // 0 = paling ketat (ruangan berisik), 1 = paling longgar (mic lemah)
  sensitivity?: number;
  // berapa lama nada harus bertahan sebelum diakui (ms)
  stableMs?: number;
}

export interface Detection {
  freq: number | null; // Hz — null kalau bukan nada biola yang meyakinkan
  rawFreq: number; // kandidat mentah dari pitchy, sebelum disaring (0 = tidak ada)
  confidence: number; // 0..1
  clarity: number; // periodisitas dari pitchy
  flatness: number; // 0..1 — makin kecil makin "bernada"
  harmonic: number; // 0..1 — porsi energi yang duduk di deret harmonik
  level: number; // RMS
  noiseFloor: number; // RMS suara latar
  calibrating: boolean;
  // Alasan ditolak — dipakai halaman diagnosa /mic biar user tahu kenapa
  reason: "ok" | "calibrating" | "quiet" | "noise" | "inharmonic" | "unstable" | "range";
}

const FREQ_MIN = 180; // Hz — sedikit di bawah G3 (196 Hz)
const FREQ_MAX = 3200; // Hz — di atas jangkauan wajar biola
const BAND_LO = 150; // Hz — batas bawah analisis spektrum
const BAND_HI = 5000; // Hz
const ABS_FLOOR = 0.0025; // RMS minimum absolut
const CALIBRATE_MS = 700;
const STABLE_CENTS = 70; // toleransi goyang nada — vibrato lebar masih lolos
const HISTORY_MS = 1200;

// Ambang yang ikut sensitivitas.
function thresholds(sensitivity: number) {
  const s = Math.min(1, Math.max(0, sensitivity));
  return {
    // Ambang level ini SENGAJA absolut, bukan relatif ke suara latar. Gate
    // relatif kelihatan pintar tapi rusak di dunia nyata: nada yang ditahan
    // lama bikin patokan latarnya naik sendiri sampai nadanya ikut ke-gate.
    // Penolakan noise diurus uji spektrum yang gak peduli keras-pelan.
    gate: ABS_FLOOR * (2 - s * 1.4), // 2x → 0.6x dari ambang absolut
    clarity: 0.94 - s * 0.09, // 0.94 → 0.85
    // Flatness dipakai sebagai saringan KASAR aja. Di ruangan ber-AC, noise
    // lebar bikin flatness naik walau nada biolanya jelas — yang menentukan
    // tetap skor harmonik.
    flatnessMax: 0.42 + s * 0.18, // 0.42 → 0.60
    harmonicMin: 0.4 - s * 0.15, // 0.40 → 0.25
  };
}

// FFT radix-2 in-place (iteratif). Dipakai buat flatness + skor harmonik.
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

export class ViolinDetector {
  private sampleRate: number;
  private opts: Required<DetectorOptions>;
  private pitchy: PitchDetector<Float32Array>;
  private re: Float32Array;
  private im: Float32Array;
  private mag: Float32Array;
  private window: Float32Array;
  private noiseFloor = ABS_FLOOR;
  private startedAt: number | null = null;
  private history: { t: number; f: number }[] = [];

  constructor(size: number, options: DetectorOptions) {
    this.sampleRate = options.sampleRate;
    this.opts = {
      sampleRate: options.sampleRate,
      sensitivity: options.sensitivity ?? 0.5,
      stableMs: options.stableMs ?? 180,
    };
    this.pitchy = PitchDetector.forFloat32Array(size);
    // Bawaan pitchy nolak sinyal di bawah ambang volumenya dan balikin pitch 0.
    // Urusan keras-pelan diurus gate kita sendiri, jadi bikin longgar di sini.
    this.pitchy.minVolumeDecibels = -70;
    this.re = new Float32Array(size);
    this.im = new Float32Array(size);
    this.mag = new Float32Array(size / 2);
    // Jendela Hann: tanpa ini, ujung buffer yang kepotong bikin spektrum
    // bocor ke mana-mana dan skor harmonik jadi ngaco.
    this.window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
  }

  setSensitivity(v: number) {
    this.opts.sensitivity = v;
  }

  reset() {
    this.noiseFloor = ABS_FLOOR;
    this.startedAt = null;
    this.history = [];
  }

  private spectrum(buf: Float32Array) {
    const n = buf.length;
    for (let i = 0; i < n; i++) {
      this.re[i] = buf[i] * this.window[i];
      this.im[i] = 0;
    }
    fft(this.re, this.im);
    for (let i = 0; i < n / 2; i++) {
      this.mag[i] = Math.hypot(this.re[i], this.im[i]);
    }
  }

  // Rata-rata geometrik / rata-rata aritmetik. Noise putih ≈ 1, nada murni ≈ 0.
  private flatness(): number {
    const binHz = this.sampleRate / (this.mag.length * 2);
    const lo = Math.max(1, Math.floor(BAND_LO / binHz));
    const hi = Math.min(this.mag.length - 1, Math.ceil(BAND_HI / binHz));
    let logSum = 0;
    let sum = 0;
    let count = 0;
    for (let i = lo; i <= hi; i++) {
      const m = this.mag[i] + 1e-12;
      logSum += Math.log(m);
      sum += m;
      count++;
    }
    if (count === 0 || sum === 0) return 1;
    return Math.exp(logSum / count) / (sum / count);
  }

  // Porsi ENERGI yang duduk tepat di f0, 2f0, 3f0… — ciri khas dawai digesek.
  //
  // Pakai energi (magnitudo kuadrat), bukan magnitudo. Noise lebar itu pelan
  // per-bin tapi kebagi ke ribuan bin; kalau dijumlah dalam magnitudo, totalnya
  // ngalahin puncak harmonik dan biola di ruangan ber-AC ikut ketolak. Dalam
  // domain energi, puncak yang tajam tetap menang.
  private harmonicScore(f0: number): number {
    const binHz = this.sampleRate / (this.mag.length * 2);
    const lo = Math.max(1, Math.floor(BAND_LO / binHz));
    const hi = Math.min(this.mag.length - 1, Math.ceil(BAND_HI / binHz));
    let total = 0;
    for (let i = lo; i <= hi; i++) total += this.mag[i] * this.mag[i];
    if (total <= 0) return 0;

    let harm = 0;
    for (let k = 1; k <= 8; k++) {
      const f = f0 * k;
      if (f > BAND_HI) break;
      const center = f / binHz;
      // ±2 bin: frekuensi asli jarang pas di tengah bin, plus bocoran jendela
      const from = Math.max(lo, Math.floor(center) - 2);
      const to = Math.min(hi, Math.ceil(center) + 2);
      let peak = 0;
      for (let i = from; i <= to; i++) {
        const e = this.mag[i] * this.mag[i];
        if (e > peak) peak = e;
      }
      harm += peak;
    }
    return Math.min(1, harm / total);
  }

  // Kestabilan diukur terhadap MEDIAN jendela, bukan bacaan terakhir: vibrato
  // bikin nada goyang naik-turun di sekitar pusat, dan kalau dibandingkan ke
  // bacaan terakhir, dua ujung ayunan bakal keliatan "gak stabil" padahal itu
  // justru ciri permainan yang bagus.
  private stable(f: number, now: number): { ok: boolean; center: number } {
    this.history = this.history.filter((h) => now - h.t <= HISTORY_MS);
    this.history.push({ t: now, f });
    const win = this.history.filter((h) => now - h.t <= this.opts.stableMs);
    if (win.length < 3 || now - win[0].t < this.opts.stableMs * 0.7) {
      return { ok: false, center: f };
    }
    const sorted = [...win].map((h) => h.f).sort((a, b) => a - b);
    const center = sorted[Math.floor(sorted.length / 2)];
    let outliers = 0;
    for (const h of win) {
      if (Math.abs(1200 * Math.log2(h.f / center)) > STABLE_CENTS) outliers++;
    }
    // Satu-dua blip dimaafkan (gesekan sesaat kotor / noise nyelip), asal
    // mayoritasnya duduk di nada yang sama.
    return { ok: outliers <= Math.floor(win.length * 0.2), center };
  }

  process(buf: Float32Array, now: number): Detection {
    if (this.startedAt === null) this.startedAt = now;
    const th = thresholds(this.opts.sensitivity);

    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
    const level = Math.sqrt(sumSq / buf.length);

    const calibrating = now - this.startedAt < CALIBRATE_MS;
    const base: Omit<Detection, "reason"> = {
      freq: null,
      rawFreq: 0,
      confidence: 0,
      clarity: 0,
      flatness: 1,
      harmonic: 0,
      level,
      noiseFloor: this.noiseFloor,
      calibrating,
    };

    // Patokan suara latar = PELACAK MINIMUM, bukan rata-rata: turun cepat pas
    // ruangan sepi, naik super pelan (time constant puluhan detik). Kalau pakai
    // rata-rata, nada panjang yang ditahan bakal ngangkat patokannya sendiri
    // sampai nada itu ke-gate — persis bug yang bikin tuner "budeg".
    const updateFloor = (fast: boolean) => {
      const rate = level < this.noiseFloor ? (fast ? 0.5 : 0.3) : fast ? 0.05 : 0.0008;
      this.noiseFloor += (level - this.noiseFloor) * rate;
      if (this.noiseFloor < ABS_FLOOR) this.noiseFloor = ABS_FLOOR;
    };

    if (calibrating) {
      updateFloor(true);
      this.history = [];
      return { ...base, noiseFloor: this.noiseFloor, reason: "calibrating" };
    }

    if (level <= th.gate) {
      updateFloor(false);
      this.history.length = 0;
      return { ...base, noiseFloor: this.noiseFloor, reason: "quiet" };
    }

    const [pitch, clarity] = this.pitchy.findPitch(buf, this.sampleRate);
    this.spectrum(buf);
    const flatness = this.flatness();

    if (!(pitch > FREQ_MIN && pitch < FREQ_MAX)) {
      updateFloor(false);
      this.history.length = 0;
      return { ...base, rawFreq: pitch, clarity, flatness, reason: "range" };
    }

    // Noise/desis: spektrum rata + periodisitas rendah
    if (flatness > th.flatnessMax || clarity < th.clarity) {
      updateFloor(false);
      this.history.length = 0;
      return { ...base, rawFreq: pitch, clarity, flatness, reason: "noise" };
    }

    const harmonic = this.harmonicScore(pitch);
    if (harmonic < th.harmonicMin) {
      updateFloor(false);
      this.history.length = 0;
      return {
        ...base,
        rawFreq: pitch,
        clarity,
        flatness,
        harmonic,
        reason: "inharmonic",
      };
    }

    updateFloor(false);

    const st = this.stable(pitch, now);
    if (!st.ok) {
      // ini kemungkinan besar nada beneran yang baru mulai, cuma belum cukup
      // lama buat dipastiin — riwayatnya JANGAN dihapus
      return {
        ...base,
        rawFreq: pitch,
        clarity,
        flatness,
        harmonic,
        noiseFloor: this.noiseFloor,
        reason: "unstable",
      };
    }

    const confidence = Math.min(
      1,
      0.4 * Math.min(1, (clarity - 0.8) / 0.2) +
        0.3 * Math.min(1, harmonic / 0.6) +
        0.3 * Math.min(1, (0.35 - flatness) / 0.3)
    );

    return {
      freq: pitch,
      rawFreq: pitch,
      confidence: Math.max(0, confidence),
      clarity,
      flatness,
      harmonic,
      level,
      noiseFloor: this.noiseFloor,
      calibrating: false,
      reason: "ok",
    };
  }
}
