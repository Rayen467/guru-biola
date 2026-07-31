// Uji aturan penulisan partitur.
//
// Patokannya notasi baku, bukan selera: tangga nada D mayor punya dua kres,
// kres pertama selalu jatuh di F garis atas, tanda tambahan berlaku sampai
// akhir birama lalu hangus, dan balok tidak boleh menyeberang ketukan.
//
// Jalankan: node --experimental-strip-types scripts/test-notation.ts

import {
  tataPartitur,
  tandaMula,
  nilaiDari,
  ejaNada,
  letakTandaMula,
  langkahDari,
  namaTanda,
} from "../src/lib/notation.ts";

let gagal = 0;
function cek(nama: string, dapat: unknown, harus: unknown) {
  const a = JSON.stringify(dapat);
  const b = JSON.stringify(harus);
  const ok = a === b;
  if (!ok) gagal++;
  console.log(`${ok ? "OK  " : "SALAH"} ${nama}`);
  if (!ok) {
    console.log(`      harus : ${b}`);
    console.log(`      dapat : ${a}`);
  }
}

// === Tanda mula ===
// D mayor: F♯ dan C♯ → 2 kres. A mayor: 3 kres. F mayor: 1 mol.
cek("tanda mula D mayor = 2 kres", tandaMula([62, 64, 66, 67, 69, 71, 73, 74]), 2);
cek("tanda mula A mayor = 3 kres", tandaMula([69, 71, 73, 74, 76, 78, 80, 81]), 3);
cek("tanda mula G mayor = 1 kres", tandaMula([55, 57, 59, 60, 62, 64, 66, 67]), 1);
cek("tanda mula C mayor = tanpa tanda", tandaMula([60, 62, 64, 65, 67, 69, 71, 72]), 0);
cek("tanda mula F mayor = 1 mol", tandaMula([65, 67, 69, 70, 72, 74, 76, 77]), -1);
cek("nama nada dasar 2 kres", namaTanda(2), "D");
cek("nama nada dasar 1 mol", namaTanda(-1), "F");

// === Letak tanda mula ===
// Kres pertama di F5, kedua di C5 — bukan sembarang F dan C.
cek("letak 2 kres = F5 lalu C5", letakTandaMula(2), [langkahDari(3, 5), langkahDari(0, 5)]);
cek("letak 1 mol = B4", letakTandaMula(-1), [langkahDari(6, 4)]);

// === Ejaan nada ===
// Nada hitam yang sama dieja beda tergantung tanda mulanya.
cek("A♯/B♭ di nada dasar berkres dieja A♯", (() => {
  const e = ejaNada(70, 2);
  return [e.huruf, e.ubah];
})(), [5, 1]);
cek("A♯/B♭ di nada dasar bermol dieja B♭", (() => {
  const e = ejaNada(70, -1);
  return [e.huruf, e.ubah];
})(), [6, -1]);

// === Nilai not ===
cek("4 ketuk = penuh", nilaiDari(4), { nilai: "penuh", titik: 0 });
cek("3 ketuk = setengah bertitik", nilaiDari(3), { nilai: "setengah", titik: 1 });
cek("1,5 ketuk = seperempat bertitik", nilaiDari(1.5), { nilai: "seperempat", titik: 1 });
cek("0,5 ketuk = seperdelapan", nilaiDari(0.5), { nilai: "seperdelapan", titik: 0 });
cek("0,25 ketuk = seperenambelas", nilaiDari(0.25), { nilai: "seperenambelas", titik: 0 });

// === Tanda mula bikin kres berulang HILANG dari badan lagu ===
// Ini inti keluhannya: di D mayor, F♯ dan C♯ tidak boleh ditulisi kres lagi.
{
  const h = tataPartitur([62, 64, 66, 67, 69, 71, 73, 74].map((midi) => ({ midi })));
  cek("D mayor: tanda mula 2 kres", h.kres, 2);
  cek(
    "D mayor: tidak ada satu pun tanda tambahan di badan lagu",
    h.not.map((n) => n.aksidental),
    [null, null, null, null, null, null, null, null]
  );
}

// === Nada di luar tanda mula tetap ditandai, tapi CUKUP SEKALI per birama ===
{
  // D mayor, lalu C asli (di luar tanda mula) muncul dua kali dalam satu birama
  // dan sekali lagi di birama berikutnya.
  const h = tataPartitur(
    [
      { midi: 62, beats: 1 },
      { midi: 72, beats: 1 }, // C asli — butuh tanda pugar
      { midi: 74, beats: 1 },
      { midi: 72, beats: 1 }, // C asli lagi, birama sama — TIDAK ditandai lagi
      { midi: 72, beats: 1 }, // birama baru — ditandai lagi
    ],
    { kres: 2 }
  );
  cek(
    "pugar ditulis sekali per birama, lalu diulang di birama baru",
    h.not.map((n) => n.aksidental),
    [null, "♮", null, null, "♮"]
  );
  cek("biramanya patah tiap 4 ketuk", h.not.map((n) => n.birama), [1, 1, 1, 1, 2]);
}

// === Balok tidak menyeberang ketukan ===
{
  // Delapan not seperdelapan = empat pasang, tiap pasang satu ketukan.
  const h = tataPartitur(
    Array.from({ length: 8 }, () => ({ midi: 69, beats: 0.5 })),
    { kres: 0 }
  );
  cek(
    "delapan seperdelapan jadi empat grup balok, bukan satu",
    h.not.map((n) => n.grupBalok),
    [0, 0, 1, 1, 2, 2, 3, 3]
  );
}
{
  // Not seperempat di tengah memutus balok.
  const h = tataPartitur(
    [
      { midi: 69, beats: 0.5 },
      { midi: 71, beats: 0.5 },
      { midi: 72, beats: 1 },
      { midi: 74, beats: 0.5 },
      { midi: 76, beats: 0.5 },
    ],
    { kres: 0 }
  );
  cek(
    "not seperempat memutus balok",
    h.not.map((n) => n.grupBalok),
    [0, 0, -1, 1, 1]
  );
}
{
  // Satu seperdelapan sendirian tidak dibalok — dia pakai bendera.
  const h = tataPartitur(
    [
      { midi: 69, beats: 0.5 },
      { midi: 71, beats: 1 },
    ],
    { kres: 0 }
  );
  cek("seperdelapan sendirian tidak dibalok", h.not.map((n) => n.grupBalok), [-1, -1]);
}

// === Tanda istirahat ikut menghitung birama ===
{
  const h = tataPartitur(
    [
      { midi: 69, beats: 2 },
      { midi: 0, beats: 2, rest: true },
      { midi: 71, beats: 1 },
    ],
    { kres: 0 }
  );
  cek("istirahat ikut mengisi birama", h.not.map((n) => n.birama), [1, 1, 2]);
  cek("istirahat ditandai rest", h.not.map((n) => n.rest), [false, true, false]);
}

console.log(gagal === 0 ? "\nSEMUA COCOK" : `\n${gagal} kasus MELESET`);
process.exitCode = gagal === 0 ? 0 : 1;
