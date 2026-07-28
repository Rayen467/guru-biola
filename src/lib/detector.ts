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
  // Mode petik (pizzicato). Nada petikan cuma bunyi sebentar dan langsung
  // meredup, jadi syarat "harus bertahan" dilonggarin. Konsekuensinya
  // penyaring suara orang ikut longgar — makanya ini pilihan sadar user,
  // bukan otomatis.
  pluck?: boolean;
}

export interface Detection {
  freq: number | null; // Hz — null kalau bukan nada biola yang meyakinkan
  rawFreq: number; // kandidat mentah dari pitchy, sebelum disaring (0 = tidak ada)
  confidence: number; // 0..1
  clarity: number; // periodisitas dari pitchy
  flatness: number; // 0..1 — makin kecil makin "bernada"
  harmonic: number; // 0..1 — porsi energi yang duduk di deret harmonik
  // 0..1 — porsi energi harmonik yang duduk di partial 1-2. Dawai digesek
  // dominan di partial bawah; vokal manusia ditarik formant ke partial 3-6.
  timbre: number;
  harmonicCount: number; // berapa partial yang beneran nongol di atas lantai spektrum
  // 0..1 — kemiripan bentuk spektrum frame ini dengan profil suara ruangan.
  // Mendekati 1 = ini cuma ruangannya (kipas/AC/dengung), bukan suara baru.
  noiseMatch: number;
  level: number; // RMS
  noiseFloor: number; // RMS suara latar
  calibrating: boolean;
  // Alasan ditolak — dipakai halaman diagnosa /mic biar user tahu kenapa
  reason:
    | "ok"
    | "calibrating"
    | "quiet"
    | "noise"
    | "inharmonic"
    | "timbre"
    | "unstable"
    | "range";
}

const FREQ_MIN = 188; // Hz — mepet di bawah G3 (196 Hz), di atas wilayah suara pria
const FREQ_MAX = 3200; // Hz — di atas jangkauan wajar biola
const BAND_LO = 150; // Hz — batas bawah analisis spektrum
const BAND_HI = 5000; // Hz
const ABS_FLOOR = 0.0025; // RMS minimum absolut
const CALIBRATE_MS = 700;
// Di bawah frekuensi ini masih wilayah suara manusia — di situ saja penjaga
// bentuk-lereng dipakai. Di atasnya (senar A ke atas) tidak, karena orang tidak
// menahan vokal selama itu di wilayah tersebut dan biola justru banyak main di sana.
const VOICE_ZONE_HZ = 330;
const STABLE_CENTS = 65; // toleransi goyang nada — vibrato lebar masih lolos
const HISTORY_MS = 1200;
// Sekali nada beneran ke-lock, ambangnya dilonggarin sebentar. Tanpa ini,
// gesekan yang sesaat kotor bikin jarum kedip-kedip padahal nadanya masih jalan.
const LOCK_HOLD_MS = 350;
const LOCK_RELAX = 0.82;

// Ambang yang ikut sensitivitas. `pluck` melonggarkan syarat yang memang
// mustahil dipenuhi nada petikan (bunyinya pendek dan spektrumnya berubah
// cepat sambil meredup).
function thresholds(sensitivity: number, pluck = false) {
  const s = Math.min(1, Math.max(0, sensitivity + (pluck ? 0.2 : 0)));
  return {
    // Ambang level ini SENGAJA absolut, bukan relatif ke suara latar. Gate
    // relatif kelihatan pintar tapi rusak di dunia nyata: nada yang ditahan
    // lama bikin patokan latarnya naik sendiri sampai nadanya ikut ke-gate.
    // Penolakan noise diurus uji spektrum yang gak peduli keras-pelan.
    gate: ABS_FLOOR * (2 - s * 1.4), // 2x → 0.6x dari ambang absolut
    clarity: 0.93 - s * 0.08, // 0.93 → 0.85
    // Flatness dipakai sebagai saringan KASAR aja. Di ruangan ber-AC, noise
    // lebar bikin flatness naik walau nada biolanya jelas — yang menentukan
    // tetap skor harmonik.
    flatnessMax: 0.40 + s * 0.18, // 0.40 → 0.58
    harmonicMin: 0.45 - s * 0.18, // 0.45 → 0.27
    // Deret harmonik harus BENERAN kelihatan, bukan cuma satu puncak. Kipas
    // bernada dan siulan cuma punya 1-2 partial; dawai punya banyak.
    minHarmonics: s < 0.35 ? 4 : 3,
    // Penjaga anti-suara-orang, dipakai cuma di wilayah suara manusia.
    // Benjolan = partial yang melonjak lagi setelah lerengnya turun (ciri
    // formant). Dawai lerengnya turun rapi.
    maxBumps: s < 0.75 ? 0 : 1,
    // Puncak partial biola jarang lebih tinggi dari partial ke-4; vokal
    // rendah sering puncaknya di partial 5-8 karena formant pertama.
    maxPeakPartial: s < 0.5 ? 4 : 5,
    // Seberapa besar porsi energi pita yang harus duduk di satu sisir harmonik
    // sebelum kandidat dari sisir dipercaya. Noise lebar gak pernah setinggi ini.
    combMin: 0.3 - s * 0.12, // 0.30 → 0.18
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
  private lockedUntil = 0;
  // Profil spektrum suara ruangan (rata-rata magnitudo per bin), dipelajari
  // pas kalibrasi dan terus diperbarui pelan tiap frame yang bukan nada.
  // Ini inti cara kerja peredam noise macam Krisp: kenali dulu bentuk
  // noise-nya, baru kurangi. Bedanya, punya kita gak nyisain suara orang —
  // suara orang justru termasuk yang harus dibuang.
  private noiseSpec: Float32Array;
  private noiseSpecReady = false;
  private denoised: Float32Array;
  private noiseMatch = 0;

  constructor(size: number, options: DetectorOptions) {
    this.sampleRate = options.sampleRate;
    this.opts = {
      sampleRate: options.sampleRate,
      pluck: options.pluck ?? false,
      sensitivity: options.sensitivity ?? 0.5,
      // 260 ms: nada yang digesek gampang nyampe segini, tapi musik dari
      // speaker/TV ganti nada tiap ~200 ms jadi kesaring. Halaman yang butuh
      // respons cepat (lagu, ritme, baca not) boleh nurunin sendiri.
      stableMs: options.stableMs ?? 260,
    };
    this.pitchy = PitchDetector.forFloat32Array(size);
    // Bawaan pitchy nolak sinyal di bawah ambang volumenya dan balikin pitch 0.
    // Urusan keras-pelan diurus gate kita sendiri, jadi bikin longgar di sini.
    this.pitchy.minVolumeDecibels = -70;
    this.re = new Float32Array(size);
    this.im = new Float32Array(size);
    this.mag = new Float32Array(size / 2);
    this.noiseSpec = new Float32Array(size / 2);
    this.denoised = new Float32Array(size / 2);
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

  setPluck(v: boolean) {
    this.opts.pluck = v;
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

  // Pengurangan spektral: bentuk noise ruangan yang udah dipelajari dikurangin
  // dari spektrum frame ini. Sisa yang nongol = suara yang BEDA dari ruangan.
  // Sisanya dipakai buat semua ukuran (flatness, harmonik, timbre), jadi biola
  // pelan di ruangan ber-AC tetap kebaca tanpa harus ngelonggarin ambang.
  private denoise(over = 1.6): void {
    for (let i = 0; i < this.mag.length; i++) {
      const clean = this.mag[i] - (this.noiseSpecReady ? over * this.noiseSpec[i] : 0);
      // sisa kecil dibiarin (spectral floor) biar gak muncul "lubang" yang
      // malah bikin spektrum keliatan lebih bernada dari aslinya
      this.denoised[i] = Math.max(clean, this.mag[i] * 0.05);
    }
  }

  // Seberapa mirip bentuk spektrum frame ini sama profil ruangan (cosine
  // similarity, 0..1). Mendekati 1 = ini cuma ruangannya doang.
  private similarityToNoise(): number {
    if (!this.noiseSpecReady) return 0;
    let dot = 0;
    let a = 0;
    let b = 0;
    for (let i = 0; i < this.mag.length; i++) {
      dot += this.mag[i] * this.noiseSpec[i];
      a += this.mag[i] * this.mag[i];
      b += this.noiseSpec[i] * this.noiseSpec[i];
    }
    if (a <= 0 || b <= 0) return 0;
    return dot / Math.sqrt(a * b);
  }

  private learnNoise(rate: number): void {
    for (let i = 0; i < this.mag.length; i++) {
      this.noiseSpec[i] += (this.mag[i] - this.noiseSpec[i]) * rate;
    }
    this.noiseSpecReady = true;
  }

  // Pencari nada lewat SISIR HARMONIK.
  //
  // Ini yang bikin biola tetap ketemu di ruangan berisik. Algoritma pitch biasa
  // (MPM/autokorelasi) kerja di gelombang waktu: begitu noise lebar numpuk,
  // bentuk gelombangnya rusak dan nilai kejernihannya anjlok — padahal
  // harmoniknya masih kelihatan jelas di spektrum. Di sini dibalik: buat tiap
  // calon f0, jumlahin energi yang duduk di f0, 2f0, 3f0… Noise nyebar rata
  // jadi gak numpuk di satu sisir; dawai numpuk banyak.
  //
  // Frekuensinya diambil dari partial yang paling kuat lalu DIBAGI nomornya —
  // resolusi jadi berkali lipat lebih halus daripada baca bin fundamental
  // (yang cuma ~12 Hz di 4096 sampel; kekasaran segitu = 47 cent di A4, gak
  // kepake buat tuner).
  private combSearch(hintHz = 0): { f0: number; strength: number } {
    const binHz = this.sampleRate / (this.mag.length * 2);
    const lo = Math.max(1, Math.floor(BAND_LO / binHz));
    const hi = Math.min(this.mag.length - 1, Math.ceil(BAND_HI / binHz));

    let total = 0;
    for (let i = lo; i <= hi; i++) total += this.denoised[i] * this.denoised[i];
    if (total <= 0) return { f0: 0, strength: 0 };

    const energyAt = (f: number): { e: number; bin: number } => {
      const center = f / binHz;
      const from = Math.max(lo, Math.round(center) - 2);
      const to = Math.min(hi, Math.round(center) + 2);
      let best = 0;
      let bestBin = Math.round(center);
      for (let i = from; i <= to; i++) {
        const e = this.denoised[i] * this.denoised[i];
        if (e > best) {
          best = e;
          bestBin = i;
        }
      }
      return { e: best, bin: bestBin };
    };

    // Grid 1/48 oktaf: cukup rapat buat nyari calon, sisanya dipertajam nanti.
    const STEP = Math.pow(2, 1 / 48);
    let bestF = 0;
    let bestScore = 0;
    for (let f = FREQ_MIN; f <= FREQ_MAX; f *= STEP) {
      let sum = 0;
      for (let k = 1; k <= 8; k++) {
        const fk = f * k;
        if (fk > BAND_HI) break;
        // partial tinggi dikasih bobot lebih kecil: yang bawah lebih menentukan
        sum += energyAt(fk).e / Math.sqrt(k);
      }
      // Kesinambungan: nada yang barusan lagi dimainkan dikasih keunggulan
      // tipis. Di ruangan yang ada orang ngobrol, sisir kadang loncat ke suara
      // orang sekejap — bobot ini yang bikin lacakannya nempel di biola,
      // bukan gonta-ganti tiap frame.
      const bias =
        hintHz > 0 && Math.abs(1200 * Math.log2(f / hintHz)) < 120 ? 1.2 : 1;
      const score = sum * bias;
      if (score > bestScore) {
        bestScore = score;
        bestF = f;
      }
    }
    if (bestF === 0) return { f0: 0, strength: 0 };

    // Pertajam: ambil partial terkuat, interpolasi parabola di puncaknya,
    // lalu bagi nomor partial-nya.
    let refF = bestF;
    let refE = 0;
    for (let k = 1; k <= 8; k++) {
      const fk = bestF * k;
      if (fk > BAND_HI) break;
      const { e, bin } = energyAt(fk);
      if (e <= refE) continue;
      const a = this.denoised[bin - 1] ?? 0;
      const b = this.denoised[bin];
      const c = this.denoised[bin + 1] ?? 0;
      const denom = a - 2 * b + c;
      const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
      refE = e;
      refF = ((bin + Math.max(-1, Math.min(1, shift))) * binHz) / k;
    }

    return { f0: refF, strength: Math.min(1, bestScore / total) };
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
      const m = this.denoised[i] + 1e-12;
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
  private harmonicProfile(f0: number): {
    score: number;
    timbre: number;
    count: number;
    peakPartial: number; // partial ke berapa yang paling kuat (1-based)
    bumps: number; // berapa kali lereng naik lagi setelah puncak
  } {
    const binHz = this.sampleRate / (this.mag.length * 2);
    const lo = Math.max(1, Math.floor(BAND_LO / binHz));
    const hi = Math.min(this.mag.length - 1, Math.ceil(BAND_HI / binHz));
    let total = 0;
    for (let i = lo; i <= hi; i++) total += this.denoised[i] * this.denoised[i];
    if (total <= 0)
      return { score: 0, timbre: 0, count: 0, peakPartial: 0, bumps: 0 };

    // Lantai spektrum = median energi bin. Partial dianggap "nongol" kalau
    // energinya jauh di atas lantai ini — bukan sekadar ada angkanya.
    const band: number[] = [];
    for (let i = lo; i <= hi; i += 3) band.push(this.denoised[i] * this.denoised[i]);
    band.sort((a, b) => a - b);
    const floor = band[Math.floor(band.length / 2)] || 1e-12;

    const partials: number[] = [];
    for (let k = 1; k <= 8; k++) {
      const f = f0 * k;
      if (f > BAND_HI) break;
      const center = f / binHz;
      // ±2 bin: frekuensi asli jarang pas di tengah bin, plus bocoran jendela
      const from = Math.max(lo, Math.floor(center) - 2);
      const to = Math.min(hi, Math.ceil(center) + 2);
      let peak = 0;
      for (let i = from; i <= to; i++) {
        const e = this.denoised[i] * this.denoised[i];
        if (e > peak) peak = e;
      }
      partials.push(peak);
    }

    const harm = partials.reduce((a, b) => a + b, 0);
    const count = partials.filter((p) => p > floor * 12).length;
    // Porsi energi harmonik yang duduk di dua partial terbawah.
    const lowShare = harm > 0 ? (partials[0] + (partials[1] ?? 0)) / harm : 0;

    // Bentuk lereng partial. Dawai digesek: naik ke satu puncak, habis itu
    // turun terus. Suara orang: formant bikin BENJOLAN — partial dekat formant
    // melonjak lagi padahal yang sebelumnya udah turun. Benjolan inilah
    // pembedanya, bukan "partial bawah harus paling kuat" — biola lewat mic
    // laptop atau speaker HP sering kehilangan partial bawahnya.
    let peakIdx = 0;
    for (let i = 1; i < partials.length; i++) {
      if (partials[i] > partials[peakIdx]) peakIdx = i;
    }
    let bumps = 0;
    for (let k = peakIdx; k < partials.length - 1; k++) {
      if (partials[k + 1] > partials[k] * 1.6) bumps++;
    }

    return {
      score: Math.min(1, harm / total),
      timbre: lowShare,
      count,
      peakPartial: peakIdx + 1,
      bumps,
    };
  }

  // Kestabilan diukur terhadap MEDIAN jendela, bukan bacaan terakhir: vibrato
  // bikin nada goyang naik-turun di sekitar pusat, dan kalau dibandingkan ke
  // bacaan terakhir, dua ujung ayunan bakal keliatan "gak stabil" padahal itu
  // justru ciri permainan yang bagus.
  private stable(
    f: number,
    now: number,
    stableMs = this.opts.stableMs
  ): { ok: boolean; center: number } {
    this.history = this.history.filter((h) => now - h.t <= HISTORY_MS);
    this.history.push({ t: now, f });
    const win = this.history.filter((h) => now - h.t <= stableMs);
    if (win.length < 3 || now - win[0].t < stableMs * 0.7) {
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
    const pluck = this.opts.pluck;
    const th = thresholds(this.opts.sensitivity, pluck);
    // Nada petikan cuma bertahan sepersekian detik sebelum meredup — nunggu
    // 260 ms bikin petikan gak pernah keitung sama sekali.
    const stableMs = pluck ? 110 : this.opts.stableMs;

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
      timbre: 0,
      harmonicCount: 0,
      noiseMatch: 0,
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
      // Sedetik pertama dipakai motret bentuk suara ruangan — kipas, AC,
      // dengung kulkas, jalanan. Ini yang nanti dikurangin tiap frame.
      //
      // Tapi kalau user-nya ternyata udah main duluan pas kalibrasi, potretnya
      // bakal berisi biola — dan profil yang kenal biola justru bakal MEMBUANG
      // biola. Jadi frame yang keliatan bernada gak ikut dipelajari.
      this.spectrum(buf);
      this.denoise(0); // pengurangan dimatiin: kita lagi ngukur mentahnya
      const [, calClarity] = this.pitchy.findPitch(buf, this.sampleRate);
      if (calClarity < 0.85 || this.flatness() > 0.5) this.learnNoise(0.35);
      return { ...base, noiseFloor: this.noiseFloor, reason: "calibrating" };
    }

    if (level <= th.gate) {
      updateFloor(false);
      this.history.length = 0;
      // Ruangan lagi sepi = kesempatan bagus nyegerin profil noise-nya.
      this.spectrum(buf);
      this.learnNoise(0.08);
      return { ...base, noiseFloor: this.noiseFloor, reason: "quiet" };
    }

    const [pitch, clarity] = this.pitchy.findPitch(buf, this.sampleRate);
    this.spectrum(buf);
    this.denoise();
    this.noiseMatch = this.similarityToNoise();
    const flatness = this.flatness();

    // Dua pencari nada dipakai bareng:
    //   - pitchy (MPM) akurat dan murah, tapi ambruk begitu ruangan berisik
    //   - sisir harmonik tahan noise, karena noise gak numpuk di deret harmonik
    // Yang dipakai: pitchy kalau gelombangnya masih bersih, kalau nggak baru
    // sisir harmonik yang ambil alih. Jadi kipas/AC yang gak bisa dimatiin
    // gak lagi bikin biola ilang dari layar.
    const pitchyOk =
      pitch > FREQ_MIN && pitch < FREQ_MAX && clarity >= th.clarity;
    // Petunjuk: nada yang lagi dilacak beberapa ratus milidetik terakhir.
    const recent = this.history.slice(-6).map((h) => h.f).sort((a, b) => a - b);
    const hint = recent.length ? recent[Math.floor(recent.length / 2)] : 0;
    const comb = this.combSearch(hint);
    const combOk =
      comb.f0 >= FREQ_MIN && comb.f0 <= FREQ_MAX && comb.strength >= th.combMin;

    const near = (f: number) =>
      hint <= 0 || (f > 0 && Math.abs(1200 * Math.log2(f / hint)) < 120);

    // Pitchy dipercaya duluan HANYA kalau jawabannya nyambung sama nada yang
    // lagi jalan. Pas ada orang ngobrol keras, pitchy kadang lompat ke suara
    // orang di tengah nada biola yang masih bunyi — kalau langsung dipakai,
    // nadanya keputus dan dianggap "gak stabil". Sisir harmonik yang nempel di
    // nada berjalan lebih dipercaya dalam kasus itu.
    let cand: number;
    let viaComb: boolean;
    if (pitchyOk && (near(pitch) || !combOk || !near(comb.f0))) {
      cand = pitch;
      viaComb = false;
    } else if (combOk) {
      cand = comb.f0;
      viaComb = true;
    } else {
      cand = pitch;
      viaComb = false;
    }

    if (!(cand > FREQ_MIN && cand < FREQ_MAX)) {
      updateFloor(false);
      this.history.length = 0;
      return { ...base, rawFreq: pitch, clarity, flatness, reason: "range" };
    }

    // Noise/desis: spektrum rata + periodisitas rendah.
    // Kalau sisir harmoniknya kuat, syarat kejernihan/kerataan diloloskan —
    // dua ukuran itu emang jelek di ruangan berisik walau nadanya nyata.
    if (!viaComb && (flatness > th.flatnessMax || clarity < th.clarity)) {
      updateFloor(false);
      this.history.length = 0;
      // Frame ini jelas bukan nada → aman dipakai nyegerin profil ruangan.
      // Cuma frame kayak gini yang boleh ngajarin profil: kalau nada ikut
      // kepelajari, profilnya bakal "ngenal" biola dan malah ngebuang biola.
      this.learnNoise(0.02);
      return {
        ...base,
        rawFreq: pitch,
        clarity,
        flatness,
        noiseMatch: this.noiseMatch,
        reason: "noise",
      };
    }

    const prof = this.harmonicProfile(cand);
    const harmonic = prof.score;
    const locked = now < this.lockedUntil;
    const relax = locked ? LOCK_RELAX : 1;

    if (harmonic < th.harmonicMin * relax || prof.count < th.minHarmonics) {
      updateFloor(false);
      this.history.length = 0;
      return {
        ...base,
        rawFreq: pitch,
        clarity,
        flatness,
        harmonic,
        timbre: prof.timbre,
        harmonicCount: prof.count,
        reason: "inharmonic",
      };
    }

    // Uji bentuk lereng partial. Cuma dipakai di WILAYAH SUARA MANUSIA
    // (f0 di bawah ~330 Hz). Di atas itu praktis gak ada orang yang nahan
    // vokal selama ratusan milidetik, sementara senar A dan E justru banyak
    // main di sana — jadi ngetes di situ cuma bikin biola ketolak.
    const inVoiceZone = cand < VOICE_ZONE_HZ;
    const irregular = prof.bumps > th.maxBumps || prof.peakPartial > th.maxPeakPartial;
    if (inVoiceZone && irregular && !locked) {
      updateFloor(false);
      this.history.length = 0;
      return {
        ...base,
        rawFreq: pitch,
        clarity,
        flatness,
        harmonic,
        timbre: prof.timbre,
        harmonicCount: prof.count,
        reason: "timbre",
      };
    }

    updateFloor(false);

    const st = this.stable(cand, now, stableMs);
    if (!st.ok) {
      // ini kemungkinan besar nada beneran yang baru mulai, cuma belum cukup
      // lama buat dipastiin — riwayatnya JANGAN dihapus
      return {
        ...base,
        rawFreq: pitch,
        clarity,
        flatness,
        harmonic,
        timbre: prof.timbre,
        harmonicCount: prof.count,
        noiseFloor: this.noiseFloor,
        reason: "unstable",
      };
    }

    this.lockedUntil = now + LOCK_HOLD_MS;

    // Kalau nadanya ketemu lewat sisir harmonik, kejernihan gelombang emang
    // rendah (itu memang kondisinya) — keyakinan dihitung dari kekuatan
    // harmoniknya saja, jangan dihukum dua kali.
    const confidence = viaComb
      ? Math.min(1, 0.55 + 0.45 * Math.min(1, harmonic / 0.6))
      : Math.min(
          1,
          0.4 * Math.min(1, (clarity - 0.8) / 0.2) +
            0.3 * Math.min(1, harmonic / 0.6) +
            0.3 * Math.min(1, (0.35 - flatness) / 0.3)
        );

    return {
      freq: cand,
      rawFreq: pitch || cand,
      confidence: Math.max(0, confidence),
      clarity,
      flatness,
      harmonic,
      timbre: prof.timbre,
      harmonicCount: prof.count,
      noiseMatch: this.noiseMatch,
      level,
      noiseFloor: this.noiseFloor,
      calibrating: false,
      reason: "ok",
    };
  }
}
