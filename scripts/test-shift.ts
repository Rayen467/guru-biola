// Uji pengukur geseran posisi dengan geseran buatan yang sifatnya sudah
// diketahui: mendarat tepat, mendarat meleset, kebablasan, dan kelamaan.
//
// Jalankan: node --experimental-strip-types scripts/test-shift.ts

import { analisaGeseran, type Cuplik } from "../src/lib/shift.ts";

const A4 = 440;
const LAJU = 60;
const hz = (midi: number, sen = 0) =>
  A4 * Math.pow(2, (midi - 69) / 12) * Math.pow(2, sen / 1200);

interface Bentuk {
  dari: number;
  ke: number;
  tahanAwalMs: number;
  geserMs: number;
  tahanAkhirMs: number;
  mendaratSen?: number; // simpangan akhir
  kebablasanSen?: number; // lewat sejauh ini di ujung geseran lalu balik
  acakSen?: number;
}

function bikin(b: Bentuk): Cuplik[] {
  const {
    dari,
    ke,
    tahanAwalMs,
    geserMs,
    tahanAkhirMs,
    mendaratSen = 0,
    kebablasanSen = 0,
    acakSen = 0,
  } = b;
  const cuplik: Cuplik[] = [];
  const langkah = 1000 / LAJU;
  const naik = ke > dari;
  const jarakSen = (ke - dari) * 100 + mendaratSen;
  let t = 0;

  const acak = () => (acakSen ? (Math.random() * 2 - 1) * acakSen : 0);

  for (let x = 0; x < tahanAwalMs; x += langkah, t += langkah) {
    cuplik.push({ t, freq: hz(dari, acak()) });
  }
  for (let x = 0; x < geserMs; x += langkah, t += langkah) {
    const p = x / geserMs;
    // Kebablasan yang sesungguhnya terjadi DI UJUNG geseran: tangannya sampai
    // duluan, kelewat, baru ditarik balik. Versi pertama skrip ini menaruh
    // puncaknya di tengah geseran — di tengah, nadanya masih jauh di bawah
    // tujuan, jadi tidak pernah benar-benar melewatinya dan alat ukurnya
    // dituduh gagal padahal audio ujinya yang salah bentuk.
    // Yang kebablasan sampai di nadanya lebih cepat lalu kelewat; yang tidak
    // kebablasan bergerak rata sepanjang durasinya. Kalau pemampatan 0,75 ini
    // dikenakan ke semua kasus, uji "geseran kelamaan" jadi salah sendiri —
    // geserannya memang selesai lebih awal dari yang diminta.
    const sampaiDi = kebablasanSen > 0 ? 0.75 : 1;
    const maju = Math.min(1, p / sampaiDi);
    const lewat =
      p <= sampaiDi
        ? 0
        : kebablasanSen * Math.sin((Math.PI * (p - sampaiDi)) / (1 - sampaiDi));
    cuplik.push({ t, freq: hz(dari, jarakSen * maju + (naik ? 1 : -1) * lewat + acak()) });
  }
  for (let x = 0; x < tahanAkhirMs; x += langkah, t += langkah) {
    cuplik.push({ t, freq: hz(ke, mendaratSen + acak()) });
  }
  return cuplik;
}

let gagal = 0;
function cek(
  nama: string,
  cuplik: Cuplik[],
  dari: number,
  ke: number,
  harus: { lama?: number; simpangan?: number; kebablasan?: number; berhasil?: boolean },
  tol = { lama: 90, simpangan: 8, kebablasan: 10 }
) {
  const h = analisaGeseran(cuplik, dari, ke, A4);
  const salah: string[] = [];
  if (harus.berhasil !== undefined && h.berhasil !== harus.berhasil) {
    salah.push(`berhasil ${h.berhasil} (harus ${harus.berhasil})`);
  }
  if (h.berhasil) {
    if (harus.lama !== undefined && Math.abs(h.lamaGeserMs - harus.lama) > tol.lama) {
      salah.push(`lama ${h.lamaGeserMs} ms (harus ~${harus.lama})`);
    }
    if (
      harus.simpangan !== undefined &&
      Math.abs(h.simpanganSen - harus.simpangan) > tol.simpangan
    ) {
      salah.push(`simpangan ${h.simpanganSen} sen (harus ~${harus.simpangan})`);
    }
    if (
      harus.kebablasan !== undefined &&
      Math.abs(h.kebablasanSen - harus.kebablasan) > tol.kebablasan
    ) {
      salah.push(`kebablasan ${h.kebablasanSen} sen (harus ~${harus.kebablasan})`);
    }
  }
  if (salah.length) gagal++;
  console.log(`${salah.length ? "SALAH" : "OK  "} ${nama}`);
  console.log(
    h.berhasil
      ? `      ukur: geser ${h.lamaGeserMs} ms · mendarat ${h.simpanganSen > 0 ? "+" : ""}${h.simpanganSen} sen · kebablasan ${h.kebablasanSen} sen`
      : `      ditolak: ${h.alasan}`
  );
  salah.forEach((s) => console.log(`      → ${s}`));
}

// Posisi 1 → 3 di senar A: B4 (71) ke D5 (74)
cek(
  "geseran bersih, mendarat tepat",
  bikin({ dari: 71, ke: 74, tahanAwalMs: 600, geserMs: 180, tahanAkhirMs: 700 }),
  71,
  74,
  { berhasil: true, lama: 180, simpangan: 0, kebablasan: 0 }
);

cek(
  "mendarat 30 sen ketinggian",
  bikin({ dari: 71, ke: 74, tahanAwalMs: 600, geserMs: 180, tahanAkhirMs: 700, mendaratSen: 30 }),
  71,
  74,
  { berhasil: true, simpangan: 30 }
);

cek(
  "kebablasan 45 sen lalu balik",
  bikin({
    dari: 71,
    ke: 74,
    tahanAwalMs: 600,
    geserMs: 220,
    tahanAkhirMs: 700,
    kebablasanSen: 45,
  }),
  71,
  74,
  { berhasil: true, kebablasan: 45, simpangan: 0 }
);

cek(
  "geseran kelamaan (merosot 700 ms)",
  bikin({ dari: 71, ke: 74, tahanAwalMs: 500, geserMs: 700, tahanAkhirMs: 700 }),
  71,
  74,
  { berhasil: true, lama: 700 }
);

cek(
  "geser turun 3 → 1",
  bikin({ dari: 74, ke: 71, tahanAwalMs: 600, geserMs: 200, tahanAkhirMs: 700 }),
  74,
  71,
  { berhasil: true, lama: 200, simpangan: 0 }
);

cek(
  "bacaan mic berisik ±8 sen",
  bikin({
    dari: 71,
    ke: 74,
    tahanAwalMs: 600,
    geserMs: 180,
    tahanAkhirMs: 700,
    acakSen: 8,
  }),
  71,
  74,
  { berhasil: true, lama: 180, simpangan: 0 },
  { lama: 120, simpangan: 10, kebablasan: 20 }
);

// Yang harus ditolak: tidak pernah sampai ke nada tujuan.
cek(
  "gak pernah nyampe nada tujuan",
  bikin({ dari: 71, ke: 74, tahanAwalMs: 600, geserMs: 180, tahanAkhirMs: 700, mendaratSen: 120 }),
  71,
  74,
  { berhasil: false }
);

console.log(gagal === 0 ? "\nSEMUA COCOK" : `\n${gagal} kasus MELESET`);
process.exitCode = gagal === 0 ? 0 : 1;
