// Uji pemilih jari.
//
// Patokannya penjarian baku yang diajarkan di mana-mana. Empat tangga nada satu
// oktaf itu mutlak — kalau tidak keluar sebagai posisi 1 semua, algoritmanya
// yang salah. Sisanya frasa tinggi, yang penjarian persisnya boleh diperdebatkan,
// jadi yang diuji cuma hal-hal yang tidak bisa didebat (misal: A5 di sebelah
// senar E kosong tidak dimainkan dengan naik ke posisi 5 di senar A).
//
// Jalankan: node --experimental-strip-types scripts/test-fingering.ts
// Menyapu bobot: SWEEP=1 node --experimental-strip-types scripts/test-fingering.ts

import { jalurJari, ringkasJalur, geseran, ONGKOS, type Pilihan } from "../src/lib/fingering.ts";

const NAMA = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const nm = (m: number) => `${NAMA[m % 12]}${Math.floor(m / 12) - 1}`;
const tulis = (j: Pilihan[]) =>
  j.map((p) => `${p.senar}${p.jari}${p.posisi > 1 ? `/p${p.posisi}` : ""}`).join(" ");

interface Uji {
  nama: string;
  midis: number[];
  // Dipenuhi atau tidak. Hanya berisi hal yang benar-benar tidak bisa didebat.
  harus: (j: Pilihan[]) => boolean;
  jelas: string;
}

const TANGGA: [string, number[], string][] = [
  ["G mayor 1 oktaf", [55, 57, 59, 60, 62, 64, 66, 67], "G0 G1 G2 G3 D0 D1 D2 D3"],
  ["D mayor 1 oktaf", [62, 64, 66, 67, 69, 71, 73, 74], "D0 D1 D2 D3 A0 A1 A2 A3"],
  ["A mayor 1 oktaf", [69, 71, 73, 74, 76, 78, 80, 81], "A0 A1 A2 A3 E0 E1 E2 E3"],
  ["C mayor 1 oktaf", [60, 62, 64, 65, 67, 69, 71, 72], "G3 D0 D1 D2 D3 A0 A1 A2"],
];

const UJI: Uji[] = [
  ...TANGGA.map(([nama, midis, harus]) => ({
    nama,
    midis,
    harus: (j: Pilihan[]) => tulis(j) === harus,
    jelas: harus,
  })),
  {
    nama: "A5 diselingi senar A kosong",
    midis: [69, 81, 69, 81, 74, 86],
    // A4 kosong lalu A5 bolak-balik: A5 diambil di senar E posisi 1 (jari 3).
    // Naik ke posisi tinggi di senar A cuma untuk menghindari menyeberang itu
    // bukan sesuatu yang dilakukan pemain.
    harus: (j) => j[1].senar === "E" && j[1].posisi === 1,
    jelas: "A5 di senar E posisi 1",
  },
  {
    nama: "frasa A5–E6 di wilayah senar E",
    midis: [81, 83, 84, 86, 88, 86, 84, 81],
    // Badan frasanya duduk di posisi 3 senar E — patokan paling baku untuk
    // wilayah ini. (Nada penutupnya boleh beda, jadi tidak diuji.)
    harus: (j) => j[0].senar === "E" && j[0].posisi === 3,
    jelas: "mulai di senar E posisi 3",
  },
  {
    nama: "tidak ada yang perlu posisi 6+",
    midis: [74, 76, 78, 79, 81, 83, 85, 86],
    harus: (j) => ringkasJalur(j).posisiTertinggi <= 5,
    jelas: "posisi tertinggi ≤ 5",
  },
];

function skor(): { lulus: number; repot: number } {
  let lulus = 0;
  let repot = 0;
  for (const u of UJI) {
    const j = jalurJari(u.midis);
    if (u.harus(j)) lulus++;
    const r = ringkasJalur(j);
    repot += r.jumlahGeser + r.regang + (r.posisiTertinggi - 1) * 0.2;
  }
  return { lulus, repot };
}

function sapu() {
  const grid = {
    geser: [3, 4, 6],
    gantiSenar: [0.8, 1.2, 2, 3],
    naikPosisi: [0.5, 1, 2],
    diPosisiTinggi: [0.2, 0.4, 0.8, 1.2],
    posisiGenap: [0, 0.6, 1.2],
    regang: [1.5, 2.5, 4],
  };
  const asli = { ...ONGKOS };
  let juara = { lulus: -1, repot: Infinity, bobot: { ...ONGKOS } };
  let n = 0;
  for (const geser of grid.geser)
    for (const gantiSenar of grid.gantiSenar)
      for (const naikPosisi of grid.naikPosisi)
        for (const diPosisiTinggi of grid.diPosisiTinggi)
          for (const posisiGenap of grid.posisiGenap)
            for (const regang of grid.regang) {
              Object.assign(ONGKOS, {
                geser,
                gantiSenar,
                naikPosisi,
                diPosisiTinggi,
                posisiGenap,
                regang,
              });
              const s = skor();
              n++;
              // Yang utama jumlah patokan yang terpenuhi. Kalau seri, dipilih
              // yang penjariannya paling ringan dimainkan — paling sedikit
              // geseran, rentangan, dan posisi tinggi.
              if (
                s.lulus > juara.lulus ||
                (s.lulus === juara.lulus && s.repot < juara.repot)
              ) {
                juara = { ...s, bobot: { ...ONGKOS } };
              }
            }
  Object.assign(ONGKOS, asli);
  console.log(`sapuan ${n} kombinasi ongkos`);
  console.log(`  terbaik: ${juara.lulus}/${UJI.length} patokan, repot ${juara.repot.toFixed(1)}`);
  console.log(`  ${JSON.stringify(juara.bobot)}\n`);
  Object.assign(ONGKOS, juara.bobot);
}

if (process.env.SWEEP) sapu();

let gagal = 0;
for (const u of UJI) {
  const j = jalurJari(u.midis);
  const ok = u.harus(j);
  if (!ok) gagal++;
  const r = ringkasJalur(j);
  console.log(`${ok ? "OK  " : "SALAH"} ${u.nama}`);
  console.log(`      nada  : ${u.midis.map(nm).join(" ")}`);
  console.log(`      jari  : ${tulis(j)}`);
  if (!ok) console.log(`      harus : ${u.jelas}`);
  console.log(
    `      posisi tertinggi ${r.posisiTertinggi} · geser ${r.jumlahGeser}× · kosong ${r.senarKosong} · regang ${r.regang}`
  );
  for (const g of geseran(j)) {
    console.log(`        geser di not ke-${g.ke + 1}: posisi ${g.dari} → ${g.tujuan}`);
  }
}

console.log(gagal === 0 ? "\nSEMUA PATOKAN TERPENUHI" : `\n${gagal} patokan MELESET`);
process.exitCode = gagal === 0 ? 0 : 1;
