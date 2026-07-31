// Uji pemeriksa senar ganda — lewat MODEL SUNGGUHAN, bukan data karangan.
//
// Inti fiturnya justru ada di kemampuan model memisahkan dua nada yang bunyi
// bersamaan, jadi menguji lapisan penilainya saja dengan kejadian buatan tidak
// membuktikan apa-apa. Audionya dibikin, dijalankan lewat model, baru hasilnya
// dinilai.
//
// Server statis lokal harus hidup (penyaji modelnya).
// Jalankan: node --experimental-strip-types scripts/test-double-stop.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { setBasicPitchPath, modelEvents, type Ev } from "../src/lib/aiTranscribe.ts";
import { analisaSenarGanda, keseimbanganDua } from "../src/lib/doubleStop.ts";

const SR = 22050;
const BASE = process.env.MODEL_BASE ?? "http://localhost:8944/guru-biola";
const CACHE = "scripts/.cache-ai";
const NAMA = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const nm = (m: number) => `${NAMA[m % 12]}${Math.floor(m / 12) - 1}`;
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// Dua nada ditahan bersamaan, masing-masing dengan kekuatannya sendiri supaya
// kasus "satu senar kalah keras" bisa ditiru.
function bikinGanda(midis: number[], amps: number[], detik = 2.5): Float32Array {
  const n = Math.round(SR * detik);
  const pcm = new Float32Array(n);
  midis.forEach((midi, idx) => {
    const f = hz(midi);
    const amp = amps[idx];
    let fase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      fase += (2 * Math.PI * f) / SR;
      const env = Math.min(1, t / 0.06) * Math.min(1, (detik - t) / 0.08);
      let v = 0;
      for (let k = 1; k <= 6; k++) v += Math.sin(fase * k) / k;
      pcm[i] += amp * env * v;
    }
  });
  let puncak = 0;
  for (const v of pcm) puncak = Math.max(puncak, Math.abs(v));
  if (puncak > 0) for (let i = 0; i < n; i++) pcm[i] = (pcm[i] / puncak) * 0.85;
  return pcm;
}

async function evCache(kunci: string, audio: Float32Array): Promise<Ev[]> {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const berkas = `${CACHE}/ganda-${kunci}.json`;
  if (existsSync(berkas)) return JSON.parse(readFileSync(berkas, "utf8"));
  const mulai = Date.now();
  const ev = await modelEvents(audio, { minFreq: 170, maxFreq: 2100 });
  console.log(`      (model jalan ${((Date.now() - mulai) / 1000).toFixed(1)}s)`);
  writeFileSync(berkas, JSON.stringify(ev));
  return ev;
}

let gagal = 0;

async function cek(
  nama: string,
  midis: number[],
  amps: number[],
  target: [number, number] | undefined,
  harus: {
    nada?: number[];
    cocok?: boolean;
    seimbangMin?: number;
    seimbangMaks?: number;
    seimbangNull?: boolean;
  }
) {
  console.log(nama);
  const audio = bikinGanda(midis, amps);
  const ev = await evCache(nama.replace(/[^a-z0-9]+/gi, "-"), audio);
  const h = analisaSenarGanda(ev, target);
  // Keseimbangan diukur dari gelombangnya, bukan dari keyakinan model.
  if (h.nada.length === 2) {
    h.keseimbangan = keseimbanganDua(audio, SR, hz(h.nada[0]), hz(h.nada[1]));
  }
  const salah: string[] = [];
  if (harus.nada && h.nada.join(",") !== harus.nada.join(",")) {
    salah.push(`nada ${h.nada.map(nm).join("+")} (harus ${harus.nada.map(nm).join("+")})`);
  }
  if (harus.cocok !== undefined && h.cocok !== harus.cocok) {
    salah.push(`cocok ${h.cocok} (harus ${harus.cocok})`);
  }
  if (harus.seimbangNull && h.keseimbangan !== null) {
    salah.push(`keseimbangan ${h.keseimbangan} (harusnya ngaku gak bisa diukur)`);
  }
  if (harus.seimbangMin !== undefined && (h.keseimbangan ?? 0) < harus.seimbangMin) {
    salah.push(`keseimbangan ${h.keseimbangan} (harus ≥ ${harus.seimbangMin})`);
  }
  if (harus.seimbangMaks !== undefined && (h.keseimbangan ?? 1) > harus.seimbangMaks) {
    salah.push(`keseimbangan ${h.keseimbangan} (harus ≤ ${harus.seimbangMaks})`);
  }
  if (salah.length) gagal++;
  console.log(
    `${salah.length ? "SALAH" : "OK  "} kedengeran ${h.nada.map(nm).join(" + ") || "(kosong)"}` +
      `${h.jarakSemiton != null ? ` · ${h.namaJarak}` : ""} · seimbang ${h.keseimbangan}` +
      `${h.alasan ? ` · ${h.alasan}` : ""}`
  );
  salah.forEach((s) => console.log(`      → ${s}`));
}

async function main() {
  setBasicPitchPath(BASE);
  console.log(`model: ${BASE}\n`);

  // D + A senar kosong — dua-duanya sama kuat.
  await cek("D dan A kosong seimbang", [62, 69], [0.5, 0.5], [62, 69], {
    nada: [62, 69],
    cocok: true,
    seimbangMin: 0.6,
  });

  // Terts F#4 + A4.
  await cek("terts F sharp dan A", [66, 69], [0.5, 0.5], [66, 69], {
    nada: [66, 69],
    cocok: true,
  });

  // Oktaf D4 + D5. Keseimbangannya sengaja TIDAK diuji — untuk oktaf memang
  // tidak bisa diukur, dan alat ini harus mengaku begitu, bukan mengarang.
  await cek("oktaf D dan D", [62, 74], [0.5, 0.5], [62, 74], {
    nada: [62, 74],
    cocok: true,
    seimbangNull: true,
  });

  // Salah jari: yang dimaksud terts F#+A, yang keluar F natural + A.
  await cek("jarinya meleset jadi terts kecil", [65, 69], [0.5, 0.5], [66, 69], {
    cocok: false,
  });

  // Satu senar cuma tersenggol — ini kesalahan paling umum.
  await cek("senar bawah cuma tersenggol", [62, 69], [0.08, 0.6], [62, 69], {
    seimbangMaks: 0.75,
  });

  console.log(
    gagal === 0 ? "\nSEMUA COCOK" : `\n${gagal} kasus MELESET`
  );
  process.exitCode = gagal === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
