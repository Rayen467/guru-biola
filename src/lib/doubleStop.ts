// Cek SENAR GANDA: dua senar digesek barengan.
//
// Ini satu-satunya latihan biola yang tidak bisa dinilai pelacak nada biasa.
// Pelacak nada mencari SATU pola berulang; begitu ada dua nada bunyi bersamaan
// polanya rusak dan dia menebak — biasanya menyebut nada ketiga yang tidak
// dimainkan siapa pun. Karena itu bagian ini memakai model polifonik yang sama
// dengan transkrip lagu.
//
// Yang paling sering salah waktu belajar senar ganda, dan semuanya terbaca di
// sini:
//   - cuma SATU senar yang benar-benar bunyi (bow-nya miring, senar satunya
//     cuma tersenggol),
//   - dua-duanya bunyi tapi TIMPANG jauh,
//   - jaraknya salah (jarinya meleset, jadi interval lain).

import type { Ev } from "@/lib/aiTranscribe";

export interface HasilSenarGanda {
  berhasil: boolean;
  alasan?: string;
  nada: number[]; // MIDI yang kedengeran, urut dari rendah
  // 0..1; 1 = dua-duanya sama kuat. null = belum diukur (butuh audionya, lihat
  // keseimbanganDua) — bukan berarti seimbang.
  keseimbangan: number | null;
  jarakSemiton: number | null;
  namaJarak: string | null;
  cocok: boolean; // sesuai target
  kurang: number[]; // nada target yang tidak kedengeran
  lebih: number[]; // nada yang kedengeran tapi bukan target
}

const NAMA_JARAK: Record<number, string> = {
  0: "unison",
  1: "sekon kecil",
  2: "sekon besar",
  3: "terts kecil",
  4: "terts besar",
  5: "kuart",
  6: "tritonus",
  7: "kuint",
  8: "sekst kecil",
  9: "sekst besar",
  10: "septim kecil",
  11: "septim besar",
  12: "oktaf",
};

export function namaJarak(semiton: number): string {
  if (semiton <= 12) return NAMA_JARAK[semiton] ?? `${semiton} semiton`;
  return `${NAMA_JARAK[semiton % 12] ?? ""} + ${Math.floor(semiton / 12)} oktaf`.trim();
}

// Latihan senar ganda paling dasar, dari yang paling gampang.
export interface LatihanGanda {
  id: string;
  nama: string;
  midis: [number, number];
  petunjuk: string;
}

export const LATIHAN_GANDA: LatihanGanda[] = [
  {
    id: "da-kosong",
    nama: "D + A senar kosong",
    midis: [62, 69],
    petunjuk:
      "Dua-duanya senar kosong, jadi nadanya pasti benar — yang dilatih murni sudut bow-nya.",
  },
  {
    id: "ae-kosong",
    nama: "A + E senar kosong",
    midis: [69, 76],
    petunjuk: "Sama seperti D+A tapi di sisi lebih tinggi; bow-nya harus lebih miring.",
  },
  {
    id: "gd-kosong",
    nama: "G + D senar kosong",
    midis: [55, 62],
    petunjuk: "Sisi paling berat. Butuh lebih banyak berat lengan supaya dua-duanya bunyi.",
  },
  {
    id: "terts-1",
    nama: "Terts: F♯ + A",
    midis: [66, 69],
    petunjuk: "Jari 2 di senar D, senar A kosong. Terts pertama yang biasanya diajarkan.",
  },
  {
    id: "sekst-1",
    nama: "Sekst: D + B",
    midis: [62, 71],
    petunjuk: "Senar D kosong, jari 1 di senar A.",
  },
  {
    id: "oktaf-1",
    nama: "Oktaf: D + D",
    midis: [62, 74],
    petunjuk:
      "Senar D kosong, jari 3 di senar A. Oktaf paling gampang ketahuan falsnya — kalau meleset sedikit langsung berdenyut.",
  },
];

const MIN_DETIK = 0.35;

// === Mengukur keseimbangan dua senar ===
//
// Ini TIDAK boleh diambil dari `amplitude` keluaran model. Angka itu skor
// keyakinan, bukan kekerasan, dan dia jenuh: senar yang cuma tersenggol —
// 7,5 kali lebih pelan — tetap dilaporkan seimbang 0,91. Kalau dipakai, murid
// yang bow-nya miring justru dikasih tahu bow-nya sudah rata.
//
// Jadi kekerasannya diukur langsung dari gelombangnya, di frekuensi masing-
// masing nada, pakai Goertzel: satu frekuensi saja per hitungan, jauh lebih
// murah daripada FFT penuh dan tidak perlu tambahan pustaka.
function goertzel(pcm: Float32Array, sr: number, f: number, dari: number, n: number): number {
  const k = (f * n) / sr;
  const w = (2 * Math.PI * k) / n;
  const coeff = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const s = (pcm[dari + i] ?? 0) + coeff * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / n;
}

// Rata-rata kekuatan satu nada sepanjang rekaman.
export function kekuatanNada(pcm: Float32Array, sr: number, f: number): number {
  const n = 2048;
  let jum = 0;
  let hitung = 0;
  for (let dari = 0; dari + n <= pcm.length; dari += n) {
    jum += goertzel(pcm, sr, f, dari, n);
    hitung++;
  }
  return hitung ? jum / hitung : 0;
}

// 1 = dua senar sama keras, mendekati 0 = satu senar hampir tidak bunyi.
//
// null kalau nada atasnya kebetulan jatuh PERSIS di harmonik nada bawah —
// oktaf, kuint dua oktaf, dan seterusnya. Di situ pengukuran ini tidak sanggup
// memisahkan mana yang datang dari senar atas dan mana yang cuma dengung senar
// bawah: oktaf yang sebenarnya seimbang sempurna terukur 0,67, dan kalau angka
// itu tetap ditampilkan, murid disuruh membetulkan sesuatu yang tidak rusak.
// Lebih baik mengaku tidak bisa mengukur daripada melaporkan angka yang salah.
export function keseimbanganDua(
  pcm: Float32Array,
  sr: number,
  fA: number,
  fB: number
): number | null {
  const rendah = Math.min(fA, fB);
  const tinggi = Math.max(fA, fB);
  const kelipatan = tinggi / rendah;
  if (Math.abs(kelipatan - Math.round(kelipatan)) < 0.03 && Math.round(kelipatan) >= 2) {
    return null;
  }
  const a = kekuatanNada(pcm, sr, fA);
  const b = kekuatanNada(pcm, sr, fB);
  const maks = Math.max(a, b);
  if (maks <= 0) return 0;
  return Math.round((Math.min(a, b) / maks) * 100) / 100;
}

// Mencari nada mana saja yang benar-benar ditahan bersamaan.
export function analisaSenarGanda(
  events: Ev[],
  target?: [number, number]
): HasilSenarGanda {
  const gagal = (alasan: string): HasilSenarGanda => ({
    berhasil: false,
    alasan,
    nada: [],
    keseimbangan: null,
    jarakSemiton: null,
    namaJarak: null,
    cocok: false,
    kurang: target ? [...target] : [],
    lebih: [],
  });

  // Gabung kejadian bernada sama: model kadang memecah satu gesekan panjang
  // jadi beberapa potong, dan potongan itu bukan not tambahan.
  const perNada = new Map<number, { lama: number; amp: number }>();
  for (const e of events) {
    if (e.durationSeconds < MIN_DETIK) continue;
    const midi = Math.round(e.pitchMidi);
    const s = perNada.get(midi) ?? { lama: 0, amp: 0 };
    s.lama += e.durationSeconds;
    s.amp = Math.max(s.amp, e.amplitude);
    perNada.set(midi, s);
  }
  if (perNada.size === 0) return gagal("Gak ada nada yang kedengeran ditahan.");

  // Ambil yang paling lama ditahan — bukan yang paling kuat. Senar yang cuma
  // tersenggol sesaat bisa saja kuat sekejap, tapi tidak akan panjang.
  const urut = [...perNada.entries()].sort((a, b) => b[1].lama - a[1].lama);
  const terlama = urut[0][1].lama;
  const kandidat = urut.filter(([, s]) => s.lama >= terlama * 0.45);

  // Senar ganda itu DUA senar, jadi hasilnya harus diperas jadi dua.
  //
  // Yang menyusup itu dengung ikutan: dua nada yang digesek bareng menghasilkan
  // dengung kuat di oktaf atasnya, dan model melaporkannya sebagai nada
  // tersendiri. D + D satu oktaf terbaca jadi tiga nada, D-D-D dua oktaf.
  //
  // Yang dibuang duluan adalah nada terlemah yang bisa dijelaskan sebagai
  // dengung dari salah satu nada lain yang sedang bunyi. Urutan ini penting:
  // kalau dengung dibuang tanpa syarat, senar ganda OKTAF — yang memang dua
  // nadanya berjarak persis satu oktaf — ikut hilang jadi satu nada saja.
  const OVERTONE = [12, 19, 24, 28];
  const sisa = [...kandidat];
  while (sisa.length > 2) {
    const adaDiBawah = (midi: number) =>
      sisa.some(([m]) => OVERTONE.includes(midi - m));
    // Yang paling lemah dulu, dan hanya kalau ada nada di bawahnya yang bisa
    // menerangkan keberadaannya.
    const terlemah = [...sisa].sort((a, b) => a[1].amp - b[1].amp);
    const buang = terlemah.find(([m]) => adaDiBawah(m)) ?? terlemah[0];
    sisa.splice(sisa.indexOf(buang), 1);
  }
  const dipakai = sisa.sort((a, b) => a[0] - b[0]);

  const nada = dipakai.map(([m]) => m);

  if (nada.length < 2) {
    return {
      berhasil: true,
      nada,
      keseimbangan: null,
      jarakSemiton: null,
      namaJarak: null,
      cocok: false,
      kurang: target ? target.filter((m) => !nada.includes(m)) : [],
      lebih: target ? nada.filter((m) => !target.includes(m)) : [],
      alasan: "Cuma satu senar yang bunyi.",
    };
  }

  const jarakSemiton = nada[nada.length - 1] - nada[0];
  const kurang = target ? target.filter((m) => !nada.includes(m)) : [];
  const lebih = target ? nada.filter((m) => !target.includes(m)) : [];

  return {
    berhasil: true,
    nada,
    // Diisi terpisah lewat keseimbanganDua — butuh gelombang audionya, yang
    // tidak ada di daftar kejadian ini.
    keseimbangan: null,
    jarakSemiton,
    namaJarak: namaJarak(jarakSemiton),
    cocok: !!target && kurang.length === 0 && lebih.length === 0,
    kurang,
    lebih,
  };
}

export const WAJAR_GANDA = {
  keseimbanganMin: 0.6, // di bawah ini satu senar jelas kalah keras
};
