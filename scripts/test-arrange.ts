// Uji pembaca jawaban AI.
//
// Diuji dengan jawaban-jawaban BERANTAKAN, bukan yang rapi: model bahasa jarang
// memberi JSON bersih. Kalau satu bentuk saja tidak tertangani, penggunanya
// cuma melihat "gagal" tanpa tahu kenapa.
//
// Jalankan: node --experimental-strip-types scripts/test-arrange.ts

import { bacaGubahan, nadaKeMidi, ambilJson } from "../src/lib/arrange.ts";

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

// === Ejaan nada ===
cek("A4", nadaKeMidi("A4"), 69);
cek("C#5", nadaKeMidi("C#5"), 73);
cek("C♯5 pakai lambang musik", nadaKeMidi("C♯5"), 73);
cek("Bb4", nadaKeMidi("Bb4"), 70);
cek("B♭4", nadaKeMidi("B♭4"), 70);
cek("cis5 gaya Belanda", nadaKeMidi("cis5"), 73);
cek("es dibaca mol", nadaKeMidi("Bes4"), 70);
cek("bukan nada", nadaKeMidi("halo"), null);

// === JSON yang dibungkus macam-macam ===
cek(
  "JSON dibungkus pagar kode",
  (ambilJson('```json\n{"a":1}\n```') as { a: number })?.a,
  1
);
cek(
  "JSON didahului kalimat",
  (ambilJson('Tentu! Ini hasilnya:\n{"a":2}\nSemoga membantu.') as { a: number })?.a,
  2
);
cek("bukan JSON sama sekali", ambilJson("maaf saya tidak bisa"), null);

// === Jawaban lengkap ===
{
  const g = bacaGubahan(`Ini dia:
\`\`\`json
{"judul":"Twinkle","nadaDasar":"D mayor","bpm":100,"ketukPerBirama":4,
"not":[{"nada":"D5","ketuk":1},{"nada":"D5","ketuk":1},{"nada":"A5","ketuk":1},{"nada":"A5","ketuk":1}],
"catatan":"bagian awal"}
\`\`\``);
  cek("judul terbaca", g?.judul, "Twinkle");
  cek("bpm terbaca", g?.bpm, 100);
  cek("not terbaca", g?.not.map((n) => n.midi), [74, 74, 81, 81]);
  cek("ketuk terbaca", g?.not.map((n) => n.beats), [1, 1, 1, 1]);
}

// === Nada tanpa oktaf harus menyambung, bukan terjun ===
{
  const g = bacaGubahan(
    '{"not":[{"nada":"G4","ketuk":1},{"nada":"A","ketuk":1},{"nada":"B","ketuk":1},{"nada":"C","ketuk":1},{"nada":"D","ketuk":1}]}'
  );
  cek(
    "tanpa oktaf, melodinya tetap naik",
    g?.not.map((n) => n.midi),
    [67, 69, 71, 72, 74]
  );
}

// === Nada di luar jangkauan biola dibuang, sisanya tetap dipakai ===
{
  const g = bacaGubahan(
    '{"not":[{"nada":"A4","ketuk":1},{"nada":"C1","ketuk":1},{"nada":"B4","ketuk":1}]}'
  );
  cek("nada mustahil dibuang", g?.not.map((n) => n.midi), [69, 71]);
  cek("dibuangnya dilaporkan", (g?.peringatan.length ?? 0) > 0, true);
}

// === Bentuk lain yang mungkin dipakai model ===
{
  const g = bacaGubahan(
    '{"notes":[{"note":"A4","beats":0.5},{"midi":71,"beats":2}]}'
  );
  cek("kunci bahasa Inggris tetap terbaca", g?.not.map((n) => [n.midi, n.beats]), [
    [69, 0.5],
    [71, 2],
  ]);
}

// === Ketuk ngawur diperbaiki, bukan dipakai mentah ===
{
  const g = bacaGubahan('{"not":[{"nada":"A4","ketuk":-3},{"nada":"B4","ketuk":99}]}');
  cek("ketuk ngawur jadi 1", g?.not.map((n) => n.beats), [1, 1]);
}

// === Jawaban yang tidak bisa dipakai harus ditolak, bukan bikin partitur kosong ===
cek("jawaban kosong ditolak", bacaGubahan("maaf saya tidak bisa membantu"), null);
cek("daftar not kosong ditolak", bacaGubahan('{"not":[]}'), null);

console.log(gagal === 0 ? "\nSEMUA COCOK" : `\n${gagal} kasus MELESET`);
process.exitCode = gagal === 0 ? 0 : 1;
