// Uji pengukur vibrato dengan goyangan buatan yang kecepatan dan lebarnya sudah
// diketahui. Kalau alat ini tidak bisa mengembalikan angka yang dimasukkan,
// angka yang dilaporkan ke murid tidak ada artinya.
//
// Jalankan: node --experimental-strip-types scripts/test-vibrato.ts

import { analisaVibrato, type Cuplik } from "../src/lib/vibrato.ts";

const A4 = 440;
const LAJU = 60; // cuplikan per detik, sama seperti yang keluar dari mic hook

// Bikin nada yang digoyang: midi tertentu, kecepatan Hz, lebar ± sen.
// Fasenya dijumlahkan tiap cuplikan, bukan dihitung sebagai f*t — kesalahan
// yang sama pernah bikin uji transkrip menuduh mesinnya rusak.
function bikin(opts: {
  midi: number;
  detik: number;
  kecepatan: number;
  lebarSen: number;
  hanyut?: number; // sen per detik, meniru nada yang pelan-pelan meleset
  geser?: number; // simpangan pusat dari nada pas, sen
  acak?: number; // sen, meniru bacaan mic yang tidak sempurna
}): Cuplik[] {
  const { midi, detik, kecepatan, lebarSen, hanyut = 0, geser = 0, acak = 0 } = opts;
  const n = Math.round(detik * LAJU);
  const dasar = A4 * Math.pow(2, (midi - 69) / 12);
  const cuplik: Cuplik[] = [];
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = (i / LAJU) * 1000;
    fase += (2 * Math.PI * kecepatan) / LAJU;
    const sen =
      geser +
      hanyut * (i / LAJU) +
      lebarSen * Math.sin(fase) +
      (acak ? (Math.random() * 2 - 1) * acak : 0);
    cuplik.push({ t, freq: dasar * Math.pow(2, sen / 1200) });
  }
  return cuplik;
}

let gagal = 0;
function cek(
  nama: string,
  cuplik: Cuplik[],
  harus: { kecepatan?: number; lebar?: number; ada?: boolean; pusat?: number },
  toleransi = { kecepatan: 0.6, lebar: 4, pusat: 4 }
) {
  const h = analisaVibrato(cuplik, A4);
  const salah: string[] = [];
  if (harus.ada !== undefined && h.adaVibrato !== harus.ada) {
    salah.push(`adaVibrato ${h.adaVibrato} (harus ${harus.ada})`);
  }
  if (harus.kecepatan !== undefined) {
    const d = Math.abs(h.kecepatanHz - harus.kecepatan);
    if (d > toleransi.kecepatan) {
      salah.push(`kecepatan ${h.kecepatanHz} Hz (harus ~${harus.kecepatan}, meleset ${d.toFixed(2)})`);
    }
  }
  if (harus.lebar !== undefined) {
    const d = Math.abs(h.lebarSen - harus.lebar);
    if (d > toleransi.lebar) {
      salah.push(`lebar ±${h.lebarSen} sen (harus ~±${harus.lebar}, meleset ${d})`);
    }
  }
  if (harus.pusat !== undefined) {
    const d = Math.abs(h.pusatSen - harus.pusat);
    if (d > toleransi.pusat) salah.push(`pusat ${h.pusatSen} sen (harus ~${harus.pusat})`);
  }
  if (salah.length) gagal++;
  console.log(`${salah.length ? "SALAH" : "OK  "} ${nama}`);
  console.log(
    `      ukur: ${h.kecepatanHz} Hz · ±${h.lebarSen} sen · ${h.jumlahGoyangan} goyangan · pusat ${h.pusatSen} sen · rata periode ${h.kerataanPeriode} lebar ${h.kerataanLebar}`
  );
  if (salah.length) salah.forEach((s) => console.log(`      → ${s}`));
}

// === Yang paling dasar: angka yang dimasukkan harus keluar lagi ===
cek("vibrato 6 Hz ±25 sen", bikin({ midi: 69, detik: 3, kecepatan: 6, lebarSen: 25 }), {
  kecepatan: 6,
  lebar: 25,
  ada: true,
});
cek("vibrato lambat 4,5 Hz ±35 sen", bikin({ midi: 62, detik: 3, kecepatan: 4.5, lebarSen: 35 }), {
  kecepatan: 4.5,
  lebar: 35,
  ada: true,
});
cek("vibrato cepat 8 Hz ±12 sen", bikin({ midi: 76, detik: 3, kecepatan: 8, lebarSen: 12 }), {
  kecepatan: 8,
  lebar: 12,
  ada: true,
});

// === Yang harus tetap benar walau kondisinya tidak ideal ===
cek(
  "nadanya hanyut 40 sen selama 3 detik",
  bikin({ midi: 69, detik: 3, kecepatan: 6, lebarSen: 25, hanyut: 13 }),
  { kecepatan: 6, lebar: 25, ada: true }
);
cek(
  "bacaan mic berisik ±3 sen",
  bikin({ midi: 69, detik: 3, kecepatan: 6, lebarSen: 25, acak: 3 }),
  { kecepatan: 6, lebar: 25, ada: true },
  { kecepatan: 0.8, lebar: 6, pusat: 5 }
);
cek(
  "nadanya kepasang 20 sen terlalu tinggi",
  bikin({ midi: 69, detik: 3, kecepatan: 6, lebarSen: 20, geser: 20 }),
  { kecepatan: 6, lebar: 20, pusat: 20, ada: true }
);

// === Kerataan harus benar-benar membedakan ===
// Angka kerataan dipajang ke murid sebagai penilaian, jadi tidak cukup "keluar
// angka" — dia harus kecil untuk goyangan rata dan besar untuk yang tidak.
{
  // Goyangan yang kecepatannya berubah-ubah 4–8 Hz.
  const n = 3 * LAJU;
  const dasar = A4;
  const cuplik: Cuplik[] = [];
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const detik = i / LAJU;
    const kecepatan = 6 + 2 * Math.sin(2 * Math.PI * 0.7 * detik);
    fase += (2 * Math.PI * kecepatan) / LAJU;
    const sen = 25 * Math.sin(fase);
    cuplik.push({ t: detik * 1000, freq: dasar * Math.pow(2, sen / 1200) });
  }
  const goyah = analisaVibrato(cuplik, A4);
  const rata = analisaVibrato(bikin({ midi: 69, detik: 3, kecepatan: 6, lebarSen: 25 }), A4);
  const ok = goyah.kerataanPeriode > 0.15 && rata.kerataanPeriode < 0.1;
  if (!ok) gagal++;
  console.log(`${ok ? "OK  " : "SALAH"} kerataan membedakan goyangan rata vs goyah`);
  console.log(
    `      rata: ${rata.kerataanPeriode} · goyah: ${goyah.kerataanPeriode} (harus goyah > 0.15 dan rata < 0.1)`
  );
}

// === Yang harus DITOLAK ===
cek("nada lurus tanpa vibrato", bikin({ midi: 69, detik: 3, kecepatan: 6, lebarSen: 0 }), {
  ada: false,
});
{
  const h = analisaVibrato(bikin({ midi: 69, detik: 0.6, kecepatan: 6, lebarSen: 25 }), A4);
  const ok = !h.cukupData && !!h.alasan;
  if (!ok) gagal++;
  console.log(`${ok ? "OK  " : "SALAH"} nada kependekan ditolak`);
  console.log(`      alasan: ${h.alasan ?? "(tidak ada — seharusnya ada)"}`);
}

console.log(gagal === 0 ? "\nSEMUA COCOK" : `\n${gagal} kasus MELESET`);
process.exitCode = gagal === 0 ? 0 : 1;
