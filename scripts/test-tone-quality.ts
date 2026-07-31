// Uji penilai kualitas bunyi dengan spektrum buatan yang sifatnya sudah
// diketahui: bunyi bersih, bunyi kasar, dan bunyi ngempos.
//
// Yang diuji bukan cuma "keluar angka", tapi bahwa ARAH sarannya benar —
// karena saran "geser bow mendekat ke bridge" dan "menjauh dari bridge" itu
// berlawanan, salah arah lebih merugikan daripada tidak menyarankan apa-apa.
//
// Jalankan: node --experimental-strip-types scripts/test-tone-quality.ts

import { ukurBunyi, nilaiBunyi, type UkuranBunyi } from "../src/lib/toneQuality.ts";

const SR = 44100;
const FFT = 4096;
const BIN = SR / FFT;
const N = FFT / 2;

interface Bentuk {
  f0: number;
  harmonik: number; // berapa harmonik yang hidup
  peluruhan: number; // amplitudo harmonik ke-k = 1/k^peluruhan
  desis: number; // amplitudo derau merata
  desisTinggiSaja?: boolean; // derau cuma di atas 4×f0 (ciri bunyi kasar)
}

function bikinSpektrum(b: Bentuk): Float32Array {
  const { f0, harmonik, peluruhan, desis, desisTinggiSaja = false } = b;
  const mag = new Float32Array(N);
  const batasKasar = (f0 * 4) / BIN;
  for (let i = 1; i < N; i++) {
    if (desis > 0 && (!desisTinggiSaja || i >= batasKasar)) {
      mag[i] += desis * (0.5 + Math.random());
    }
  }
  for (let k = 1; k <= harmonik; k++) {
    const bin = Math.round((f0 * k) / BIN);
    if (bin >= N) break;
    const a = 1 / Math.pow(k, peluruhan);
    // Sebar sedikit ke bin tetangga, seperti FFT sungguhan.
    mag[bin] += a;
    if (bin > 0) mag[bin - 1] += a * 0.45;
    if (bin + 1 < N) mag[bin + 1] += a * 0.45;
  }
  return mag;
}

let gagal = 0;
function cek(
  nama: string,
  bentuk: Bentuk,
  db: number[],
  harusArah: "kasar" | "ngempos" | "pas"
) {
  const ukuran: UkuranBunyi[] = [];
  for (let i = 0; i < 10; i++) ukuran.push(ukurBunyi(bikinSpektrum(bentuk), BIN, bentuk.f0));
  const h = nilaiBunyi(ukuran, db);
  const ok = h.arah === harusArah;
  if (!ok) gagal++;
  console.log(`${ok ? "OK  " : "SALAH"} ${nama}`);
  console.log(
    `      jernih ${h.kejernihan} · cerah ${h.kecerahan} · desis ${h.desis} · dasar ${h.kuatDasar} · rata ${h.ratanya} → ${h.arah}`
  );
  if (!ok) console.log(`      → harusnya "${harusArah}"`);
}

const DB_RATA = [-18, -18.4, -17.8, -18.2, -18, -17.9, -18.1, -18, -18.3, -18];
const DB_GOYAH = [-24, -14, -26, -13, -25, -15, -27, -12, -24, -16];

// Bunyi biola yang benar: deret harmonik jelas, meluruh wajar, derau kecil.
cek(
  "gesekan bersih A4",
  { f0: 440, harmonik: 10, peluruhan: 1, desis: 0.006 },
  DB_RATA,
  "pas"
);
cek(
  "gesekan bersih D4 (senar bawah, lebih banyak harmonik)",
  { f0: 293.66, harmonik: 12, peluruhan: 1, desis: 0.006 },
  DB_RATA,
  "pas"
);

// Ditekan berlebihan / terlalu dekat bridge: harmonik tinggi ikut kuat DAN ada
// bunyi kasar yang bukan kelipatan nada dasarnya.
cek(
  "kasar — ditekan berlebihan",
  { f0: 440, harmonik: 14, peluruhan: 0.25, desis: 0.09, desisTinggiSaja: true },
  DB_RATA,
  "kasar"
);

// Kurang tekanan / bow di atas fingerboard: nada dasarnya lemah, energinya
// habis jadi desis merata.
cek(
  "ngempos — kurang gigit",
  { f0: 440, harmonik: 4, peluruhan: 2.2, desis: 0.16 },
  DB_RATA,
  "ngempos"
);
cek(
  "ngempos parah — hampir cuma angin",
  { f0: 440, harmonik: 3, peluruhan: 3, desis: 0.3 },
  DB_RATA,
  "ngempos"
);

// Kerataan volume diuji terpisah dari arah bunyinya.
{
  const ukuran: UkuranBunyi[] = [];
  const b: Bentuk = { f0: 440, harmonik: 10, peluruhan: 1, desis: 0.006 };
  for (let i = 0; i < 10; i++) ukuran.push(ukurBunyi(bikinSpektrum(b), BIN, b.f0));
  const rata = nilaiBunyi(ukuran, DB_RATA);
  const goyah = nilaiBunyi(ukuran, DB_GOYAH);
  const ok = rata.ratanya > 0.85 && goyah.ratanya < 0.3;
  if (!ok) gagal++;
  console.log(`${ok ? "OK  " : "SALAH"} kerataan volume membedakan bow rata vs goyah`);
  console.log(`      rata ${rata.ratanya} · goyah ${goyah.ratanya} (harus rata >0.85, goyah <0.3)`);
}

// Gesekan kependekan harus ditolak, bukan dinilai asal.
{
  const h = nilaiBunyi([], []);
  const ok = !h.cukupData && !!h.alasan;
  if (!ok) gagal++;
  console.log(`${ok ? "OK  " : "SALAH"} gesekan kependekan ditolak`);
}

console.log(gagal === 0 ? "\nSEMUA COCOK" : `\n${gagal} kasus MELESET`);
process.exitCode = gagal === 0 ? 0 : 1;
