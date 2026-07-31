// Uji mesin transkrip AI (Basic Pitch) di luar browser.
//
// Kenapa di luar browser: di halaman, satu percobaan artinya build ulang,
// muat ulang, tunggu inferensi, lalu cuma bisa membaca nama not di layar —
// tanpa oktaf, tanpa waktu. Di sini kelihatan angka MIDI dan milidetiknya,
// jadi salahnya ketahuan di mana.
//
// Jalankan (server statis lokal harus hidup dulu, untuk melayani modelnya):
//   node --experimental-strip-types scripts/test-ai-transcribe.ts
//
// Ganti alamat model lewat: MODEL_BASE=http://localhost:8944/guru-biola

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import {
  setBasicPitchPath,
  modelEvents,
  notesFromEvents,
  BOBOT,
  type Ev,
} from "../src/lib/aiTranscribe.ts";

// Menjalankan modelnya makan ~48 detik per kasus di Node (TensorFlow.js versi
// JS murni). Keluaran mentahnya disimpan, jadi menyetel aturan pemilih melodi
// tidak perlu menghitung ulang. Hapus foldernya kalau audio ujinya berubah.
const CACHE = "scripts/.cache-ai";
async function eventsBerCache(kunci: string, audio: Float32Array): Promise<Ev[]> {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const berkas = `${CACHE}/${kunci}.json`;
  if (existsSync(berkas)) return JSON.parse(readFileSync(berkas, "utf8"));
  const mulai = Date.now();
  const ev = await modelEvents(audio, { minFreq: 180, maxFreq: 2100 });
  console.log(`  (model jalan ${((Date.now() - mulai) / 1000).toFixed(1)}s)`);
  writeFileSync(berkas, JSON.stringify(ev));
  return ev;
}

const SR = 22050; // model cuma menerima ini
const BASE = process.env.MODEL_BASE ?? "http://localhost:8944/guru-biola";

const NAMA = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const midiName = (m: number) => `${NAMA[m % 12]}${Math.floor(m / 12) - 1}`;
const hzToMidi = (hz: number) => Math.round(69 + 12 * Math.log2(hz / 440));

interface Nada {
  hz: number;
  mulaiMs: number;
  durMs: number;
}

// Nada gesekan tiruan: deret harmonik yang meluruh + serangan lembut, mirip
// biola. Harmoniknya sengaja dibiarkan kuat — di dunia nyata harmonik inilah
// yang bikin pelacak nada salah menebak satu oktaf ke atas.
function tulisNada(
  pcm: Float32Array,
  hz: number,
  mulaiMs: number,
  durMs: number,
  amp: number,
  jmlHarmonik: number
) {
  const i0 = Math.round((SR * mulaiMs) / 1000);
  const len = Math.round((SR * durMs) / 1000);
  const serang = Math.round(SR * 0.04);
  const lepas = Math.round(SR * 0.05);
  // Fase DIJUMLAHKAN tiap cuplik, bukan dihitung sebagai hz*t.
  // Kalau vibrato ditulis sin(2π · hz · vib(t) · t), yang keluar bukan getaran
  // ±7 sen melainkan sapuan frekuensi yang melebar terus — di detik ke-6
  // melencengnya sudah ratusan Hz. Salah begini bikin uji ini menuduh mesinnya
  // rusak padahal audio ujinya yang rusak.
  let fase = 0;
  for (let i = 0; i < len && i0 + i < pcm.length; i++) {
    const t = i / SR;
    const env =
      Math.min(1, i / serang) * Math.min(1, Math.max(0, (len - i) / lepas));
    // getaran jari (vibrato) tipis, seperti main sungguhan
    const fSaatIni = hz * (1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t));
    fase += (2 * Math.PI * fSaatIni) / SR;
    let v = 0;
    for (let k = 1; k <= jmlHarmonik; k++) v += Math.sin(fase * k) / k;
    pcm[i0 + i] += amp * env * v;
  }
}

function bikinAudio(
  melodi: Nada[],
  iringan: Nada[],
  desisDb: number
): Float32Array {
  const akhir = Math.max(
    ...[...melodi, ...iringan].map((n) => n.mulaiMs + n.durMs)
  );
  const pcm = new Float32Array(Math.round((SR * (akhir + 300)) / 1000));
  for (const n of melodi) tulisNada(pcm, n.hz, n.mulaiMs, n.durMs, 0.45, 6);
  for (const n of iringan) tulisNada(pcm, n.hz, n.mulaiMs, n.durMs, 0.22, 4);
  if (desisDb > -90) {
    const a = Math.pow(10, desisDb / 20);
    for (let i = 0; i < pcm.length; i++) pcm[i] += a * (Math.random() * 2 - 1);
  }
  let puncak = 0;
  for (const v of pcm) puncak = Math.max(puncak, Math.abs(v));
  if (puncak > 0) for (let i = 0; i < pcm.length; i++) pcm[i] = (pcm[i] / puncak) * 0.85;
  return pcm;
}

// Melodi 8 nada: A B C# D E D C# A (oktaf ke-4/5, wilayah biola)
const MELODI: Nada[] = [
  { hz: 440.0, mulaiMs: 0, durMs: 700 },
  { hz: 493.88, mulaiMs: 800, durMs: 600 },
  { hz: 554.37, mulaiMs: 1600, durMs: 600 },
  { hz: 587.33, mulaiMs: 2400, durMs: 700 },
  { hz: 659.25, mulaiMs: 3200, durMs: 700 },
  { hz: 587.33, mulaiMs: 4000, durMs: 600 },
  { hz: 554.37, mulaiMs: 4800, durMs: 600 },
  { hz: 440.0, mulaiMs: 5600, durMs: 700 },
];

// Iringan: akor A mayor + bass, semuanya DI BAWAH melodi.
const IRINGAN: Nada[] = [];
for (let bar = 0; bar < 4; bar++) {
  const t = bar * 1600;
  for (const hz of [220.0, 277.18, 329.63]) {
    IRINGAN.push({ hz, mulaiMs: t, durMs: 1500 });
  }
  IRINGAN.push({ hz: 110.0, mulaiMs: t, durMs: 1500 });
}

interface Hasil {
  nama: string;
  benar: number;
  total: number;
  palsu: number;
  galatWaktuMs: number;
  deret: string;
}

// Cocokkan hasil ke kebenaran lewat tumpang tindih waktu: tiap nada asli
// dicari not hasil yang paling banyak menutupi rentang waktunya.
function nilai(
  nama: string,
  hasil: { midi: number; startMs: number; durMs: number }[],
  kebenaran: Nada[]
): Hasil {
  let benar = 0;
  let totalGalat = 0;
  const terpakai = new Set<number>();
  for (const asli of kebenaran) {
    const m = hzToMidi(asli.hz);
    const a0 = asli.mulaiMs;
    const a1 = asli.mulaiMs + asli.durMs;
    let terbaik = -1;
    let tumpangTerbaik = 0;
    hasil.forEach((h, i) => {
      const tumpang =
        Math.min(a1, h.startMs + h.durMs) - Math.max(a0, h.startMs);
      if (tumpang > tumpangTerbaik) {
        tumpangTerbaik = tumpang;
        terbaik = i;
      }
    });
    if (terbaik >= 0 && hasil[terbaik].midi === m) {
      benar++;
      totalGalat += Math.abs(hasil[terbaik].startMs - a0);
      terpakai.add(terbaik);
    }
  }
  return {
    nama,
    benar,
    total: kebenaran.length,
    palsu: hasil.length - terpakai.size,
    galatWaktuMs: benar ? Math.round(totalGalat / benar) : 0,
    deret: hasil.map((h) => midiName(h.midi)).join(" "),
  };
}

// Nada cepat: 16 not @150 ms — menguji apakah aturan "not terpendek" dan
// penghalus median memakan not yang memang pendek.
const CEPAT: Nada[] = [];
{
  const tangga = [440.0, 493.88, 554.37, 587.33, 659.25, 739.99, 830.61, 880.0];
  for (let i = 0; i < 16; i++) {
    CEPAT.push({
      hz: tangga[i < 8 ? i : 15 - i],
      mulaiMs: i * 170,
      durMs: 150,
    });
  }
}

// Lompat oktaf sungguhan. Ini jebakan langsung buat penjaga overtone: kalau dia
// asal buang not yang berjarak 12 semiton, melodi ini hancur.
const LOMPAT: Nada[] = [
  { hz: 440.0, mulaiMs: 0, durMs: 600 },
  { hz: 880.0, mulaiMs: 700, durMs: 600 },
  { hz: 440.0, mulaiMs: 1400, durMs: 600 },
  { hz: 880.0, mulaiMs: 2100, durMs: 600 },
  { hz: 587.33, mulaiMs: 2800, durMs: 600 },
  { hz: 1174.66, mulaiMs: 3500, durMs: 600 },
];

// Nada sambung-menyambung (legato): tiap nada masih berbunyi 90 ms saat nada
// berikutnya mulai. Menguji apakah aturan "iringan yang nongol di jeda" salah
// menuduh nada melodi yang sempat tertutup nada sebelumnya.
const LEGATO: Nada[] = MELODI.map((n, i) => ({
  hz: n.hz,
  mulaiMs: i * 700,
  durMs: 790,
}));

// Wilayah rendah, senar G. Menguji batas bawah minFreq dan apakah bass iringan
// mulai menang karena melodinya sudah dekat dengannya.
const RENDAH: Nada[] = [
  { hz: 196.0, mulaiMs: 0, durMs: 600 },
  { hz: 220.0, mulaiMs: 700, durMs: 600 },
  { hz: 246.94, mulaiMs: 1400, durMs: 600 },
  { hz: 261.63, mulaiMs: 2100, durMs: 600 },
  { hz: 293.66, mulaiMs: 2800, durMs: 600 },
  { hz: 246.94, mulaiMs: 3500, durMs: 600 },
];

// Melodi yang nadanya PAS satu oktaf di atas nada akor, mulai barengan pula —
// kasus terburuk buat penjaga overtone. Akor C♯ mayor ditahan, melodi C♯5.
const IRINGAN_CSHARP: Nada[] = [];
for (let bar = 0; bar < 3; bar++) {
  const t = bar * 1400;
  for (const hz of [277.18, 329.63, 415.3]) {
    IRINGAN_CSHARP.push({ hz, mulaiMs: t, durMs: 1350 });
  }
}
const OKTAF_AKOR: Nada[] = [
  { hz: 554.37, mulaiMs: 0, durMs: 600 }, // C#5 = satu oktaf di atas C#4 akor
  { hz: 659.25, mulaiMs: 700, durMs: 600 },
  { hz: 554.37, mulaiMs: 1400, durMs: 600 },
  { hz: 830.61, mulaiMs: 2100, durMs: 600 }, // G#5 = satu oktaf di atas G#4 akor
  { hz: 659.25, mulaiMs: 2800, durMs: 600 },
  { hz: 554.37, mulaiMs: 3500, durMs: 600 },
];

// === Kasus penguji terpisah (holdout) ===
// Bobot disetel HANYA dari KASUS. Kelompok ini tidak pernah ikut menyetel, jadi
// angkanya jujur menggambarkan lagu yang belum pernah dilihat. Tanpa pemisahan
// ini, nilai bagus cuma berarti "bobotnya sudah dipaskan ke soalnya sendiri".
const MELODI_2: Nada[] = [
  { hz: 392.0, mulaiMs: 0, durMs: 500 }, // G4
  { hz: 349.23, mulaiMs: 560, durMs: 380 }, // F4
  { hz: 329.63, mulaiMs: 1000, durMs: 900 }, // E4 panjang
  { hz: 440.0, mulaiMs: 1960, durMs: 380 }, // A4
  { hz: 493.88, mulaiMs: 2400, durMs: 500 }, // B4
  { hz: 523.25, mulaiMs: 2960, durMs: 900 }, // C5 panjang
  { hz: 493.88, mulaiMs: 3920, durMs: 380 }, // B4
  { hz: 392.0, mulaiMs: 4360, durMs: 800 }, // G4
];
const IRINGAN_2: Nada[] = [];
for (let bar = 0; bar < 4; bar++) {
  const t = bar * 1300;
  // Akor C mayor / A minor bergantian + bass berjalan
  const akor = bar % 2 === 0 ? [261.63, 329.63, 392.0] : [220.0, 261.63, 329.63];
  for (const hz of akor) IRINGAN_2.push({ hz, mulaiMs: t, durMs: 1250 });
  IRINGAN_2.push({ hz: bar % 2 === 0 ? 130.81 : 110.0, mulaiMs: t, durMs: 1250 });
}

const MELODI_3: Nada[] = [
  { hz: 587.33, mulaiMs: 0, durMs: 300 },
  { hz: 659.25, mulaiMs: 320, durMs: 300 },
  { hz: 698.46, mulaiMs: 640, durMs: 300 },
  { hz: 783.99, mulaiMs: 960, durMs: 600 },
  { hz: 698.46, mulaiMs: 1620, durMs: 300 },
  { hz: 659.25, mulaiMs: 1940, durMs: 300 },
  { hz: 587.33, mulaiMs: 2260, durMs: 700 },
  { hz: 493.88, mulaiMs: 3020, durMs: 700 },
];

const HOLDOUT: {
  nama: string;
  melodi: Nada[];
  iringan: Nada[];
  desisDb: number;
}[] = [
  { nama: "[uji] lagu lain + akor", melodi: MELODI_2, iringan: IRINGAN_2, desisDb: -90 },
  {
    nama: "[uji] lagu lain + akor + desis",
    melodi: MELODI_2,
    iringan: IRINGAN_2,
    desisDb: -34,
  },
  { nama: "[uji] frasa naik-turun", melodi: MELODI_3, iringan: [], desisDb: -90 },
  {
    nama: "[uji] frasa naik-turun + akor",
    melodi: MELODI_3,
    iringan: IRINGAN_2,
    desisDb: -90,
  },
];

const KASUS: { nama: string; melodi: Nada[]; iringan: Nada[]; desisDb: number }[] =
  [
    { nama: "melodi sendirian", melodi: MELODI, iringan: [], desisDb: -90 },
    { nama: "melodi + akor + bass", melodi: MELODI, iringan: IRINGAN, desisDb: -90 },
    {
      nama: "melodi + akor + bass + desis",
      melodi: MELODI,
      iringan: IRINGAN,
      desisDb: -34,
    },
    { nama: "not cepat 16an", melodi: CEPAT, iringan: [], desisDb: -90 },
    { nama: "not cepat + iringan", melodi: CEPAT, iringan: IRINGAN, desisDb: -90 },
    { nama: "lompat oktaf", melodi: LOMPAT, iringan: [], desisDb: -90 },
    { nama: "lompat oktaf + iringan", melodi: LOMPAT, iringan: IRINGAN, desisDb: -90 },
    { nama: "legato + iringan", melodi: LEGATO, iringan: IRINGAN, desisDb: -90 },
    { nama: "senar G rendah", melodi: RENDAH, iringan: [], desisDb: -90 },
    {
      nama: "melodi pas satu oktaf di atas akor",
      melodi: OKTAF_AKOR,
      iringan: IRINGAN_CSHARP,
      desisDb: -90,
    },
  ];

// Menyapu bobot penilai garis melodi. Ada supaya angka-angka di BOBOT bukan
// hasil kira-kira: tiap kombinasi diadu ke seluruh kasus uji, lalu yang menang
// dipakai. Keluaran model sudah tersimpan, jadi satu sapuan penuh cuma butuh
// beberapa detik. Jalankan dengan: SWEEP=1 node --experimental-strip-types ...
async function sapuBobot(bahan: { k: (typeof KASUS)[number]; ev: Ev[] }[]) {
  const grid = {
    yakin: [1, 2, 3, 4],
    atas: [0.2, 0.35, 0.5, 0.75, 1],
    dengung: [0.25, 0.5, 0.75, 1, 1.5],
    lompat: [0.1, 0.15, 0.2, 0.3, 0.5],
  };
  let juara = { skor: -Infinity, bobot: { ...BOBOT }, benar: 0, palsu: 0 };
  let dicoba = 0;
  for (const yakin of grid.yakin)
    for (const atas of grid.atas)
      for (const dengung of grid.dengung)
        for (const lompat of grid.lompat) {
          Object.assign(BOBOT, { yakin, atas, dengung, lompat });
          let benar = 0;
          let palsu = 0;
          for (const { k, ev } of bahan) {
            const h = nilai(k.nama, notesFromEvents(ev), k.melodi);
            benar += h.benar;
            palsu += h.palsu;
          }
          dicoba++;
          // Not palsu dihitung setengah bobot not benar: hasil yang melewatkan
          // nada lebih menyesatkan daripada hasil yang kelebihan satu nada.
          const skor = benar - palsu * 0.5;
          if (skor > juara.skor) {
            juara = { skor, bobot: { yakin, atas, dengung, lompat }, benar, palsu };
          }
        }
  console.log(`\nsapuan ${dicoba} kombinasi bobot`);
  console.log(`  terbaik: ${JSON.stringify(juara.bobot)}`);
  console.log(`  ${juara.benar} nada benar, ${juara.palsu} not palsu\n`);
  Object.assign(BOBOT, juara.bobot);
}

async function main() {
  setBasicPitchPath(BASE);
  console.log(`model: ${BASE}/models/basic-pitch/model.json\n`);

  if (process.env.SWEEP) {
    const bahan = [];
    for (const k of KASUS) {
      const audio = bikinAudio(k.melodi, k.iringan, k.desisDb);
      bahan.push({
        k,
        ev: await eventsBerCache(k.nama.replace(/[^a-z]+/gi, "-"), audio),
      });
    }
    await sapuBobot(bahan);
  }

  const semua: Hasil[] = [];
  for (const k of [...KASUS, ...HOLDOUT]) {
    console.log(k.nama);
    const audio = bikinAudio(k.melodi, k.iringan, k.desisDb);
    const ev = await eventsBerCache(k.nama.replace(/[^a-z]+/gi, "-"), audio);
    const not = notesFromEvents(ev);
    const h = nilai(k.nama, not, k.melodi);
    semua.push(h);
    console.log(`  mentah dari model: ${ev.length} not`);
    console.log(`  harusnya : ${k.melodi.map((n) => midiName(hzToMidi(n.hz))).join(" ")}`);
    console.log(`  hasil    : ${h.deret}`);
    console.log(
      `  benar ${h.benar}/${h.total} · not palsu ${h.palsu} · geser awal ${h.galatWaktuMs} ms\n`
    );
  }

  const jumlah = (daftar: Hasil[]) => ({
    benar: daftar.reduce((a, b) => a + b.benar, 0),
    total: daftar.reduce((a, b) => a + b.total, 0),
    palsu: daftar.reduce((a, b) => a + b.palsu, 0),
  });
  const setel = jumlah(semua.filter((h) => !h.nama.startsWith("[uji]")));
  const uji = jumlah(semua.filter((h) => h.nama.startsWith("[uji]")));
  console.log(
    `KASUS SETELAN : ${setel.benar}/${setel.total} nada benar, ${setel.palsu} not palsu`
  );
  console.log(
    `KASUS PENGUJI : ${uji.benar}/${uji.total} nada benar, ${uji.palsu} not palsu  ← lagu yang belum pernah dipakai nyetel`
  );
  if (uji.benar < uji.total || uji.palsu > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
