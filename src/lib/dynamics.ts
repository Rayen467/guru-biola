"use client";

// Dinamika (keras-lembut) dan arah bow.
//
// Sampai sekarang partitur di app ini cuma bilang NADA APA. Padahal tiap
// gesekan punya dua hal lain yang sama pentingnya:
//   1. seberapa keras  → dinamika (p, mf, f)
//   2. arah & panjang bow → turun/naik, pakai berapa bagian bow
// Dua-duanya yang bikin bunyi kedengeran musikal, bukan cuma benar.

export type Dyn = "pp" | "p" | "mp" | "mf" | "f" | "ff";

export const DYN_ORDER: Dyn[] = ["pp", "p", "mp", "mf", "f", "ff"];

export const DYN_LABEL: Record<Dyn, string> = {
  pp: "sangat lembut",
  p: "lembut",
  mp: "agak lembut",
  mf: "agak keras",
  f: "keras",
  ff: "sangat keras",
};

// Rentang volume masuk mic (dB RMS) yang dianggap pas untuk tiap dinamika.
// Angkanya relatif — yang penting JARAK antar tingkat, bukan nilai mutlaknya,
// karena tiap mic beda sensitivitas. Makanya ada kalibrasi di bawah.
const DYN_DB: Record<Dyn, number> = {
  pp: -34,
  p: -28,
  mp: -23,
  mf: -19,
  f: -15,
  ff: -11,
};

export function dynTargetDb(d: Dyn, offset = 0): number {
  return DYN_DB[d] + offset;
}

// Tebak dinamika dari volume terukur. Dipakai buat hasil transkrip: bagian
// lagu yang direkam pelan jadi p, yang keras jadi f.
export function dynFromDb(db: number, offset = 0): Dyn {
  let best: Dyn = "mf";
  let jarak = Infinity;
  for (const d of DYN_ORDER) {
    const j = Math.abs(db - (DYN_DB[d] + offset));
    if (j < jarak) {
      jarak = j;
      best = d;
    }
  }
  return best;
}

// Selisih volume pemain terhadap target, diterjemahkan jadi instruksi.
export function dynFeedback(
  db: number,
  target: Dyn,
  offset = 0
): { status: "pas" | "kurang" | "lebih"; pesan: string; selisih: number } {
  const t = dynTargetDb(target, offset);
  const d = Math.round(db - t);
  if (Math.abs(d) <= 4) {
    return { status: "pas", pesan: `volume pas (${target})`, selisih: d };
  }
  if (d < 0) {
    return {
      status: "kurang",
      pesan: `kurang ${Math.abs(d)} dB — tambah berat lengan, atau bow lebih dekat jembatan`,
      selisih: d,
    };
  }
  return {
    status: "lebih",
    pesan: `lebih ${d} dB — longgarin tekanan, atau bow lebih dekat fingerboard`,
    selisih: d,
  };
}

export type BowDir = "turun" | "naik";

// Arah bow bawaan: mulai turun, lalu gantian tiap not. Ini yang diajarkan di
// awal dan yang tertulis di hampir semua buku pemula. Slur dan pengulangan
// arah baru dipakai di tingkat lanjut — jangan dikarang di sini, karena arah
// bow yang salah lebih membingungkan daripada tidak ada tanda sama sekali.
export function bowDirections(count: number, mulai: BowDir = "turun"): BowDir[] {
  const out: BowDir[] = [];
  for (let i = 0; i < count; i++) {
    out.push(i % 2 === 0 ? mulai : mulai === "turun" ? "naik" : "turun");
  }
  return out;
}

export const BOW_MARK: Record<BowDir, string> = {
  turun: "⊓", // tanda baku down-bow
  naik: "V", // tanda baku up-bow
};

// Berapa banyak bow yang dipakai, dari panjang not dan dinamikanya.
// Aturan fisiknya: makin panjang not → makin banyak bow; makin keras → makin
// cepat bow jalan, jadi butuh lebih banyak bow lagi untuk durasi yang sama.
export function bowUse(beats: number, dyn: Dyn): string {
  const keras = DYN_ORDER.indexOf(dyn) >= 4; // f atau ff
  const lembut = DYN_ORDER.indexOf(dyn) <= 1; // pp atau p
  if (beats >= 3) return keras ? "bow penuh, cepat" : "bow penuh, pelan";
  if (beats >= 2) return keras ? "bow penuh" : "3/4 bow";
  if (beats >= 1) return keras ? "3/4 bow" : "setengah bow";
  return lembut ? "seperempat bow, dekat pangkal" : "setengah bow";
}

// Kalibrasi mic: pemakai memainkan satu nada "biasa" (mf), lalu selisihnya
// disimpan. Tanpa ini, mic laptop yang pelan bakal dikira main lembut terus.
const CAL_KEY = "guru-biola-dyn-offset";

export function getDynOffset(): number {
  if (typeof window === "undefined") return 0;
  const v = Number(localStorage.getItem(CAL_KEY));
  return Number.isFinite(v) ? v : 0;
}

export function setDynOffset(db: number) {
  localStorage.setItem(CAL_KEY, String(Math.round(db)));
}
