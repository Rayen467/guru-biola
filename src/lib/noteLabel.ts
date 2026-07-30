"use client";

// Cara nulis nada. Satu setelan, dipakai di semua halaman.
//
// Alasannya: "C♯5" gak berarti apa-apa buat orang yang belum hafal nama nada,
// sementara "A2" (senar A, jari 2) itu langsung bisa dikerjain tangan. Yang
// terakhir bukan cara nulis resmi, tapi justru itu yang dipakai guru waktu
// murid baru mulai — nama nadanya nyusul belakangan.

import { useEffect, useState } from "react";

// "huruf" = persis seperti stiker yang ditempel di fingerboard: huruf nadanya
// saja, tanpa angka oktaf. Buat pemilik biola berstiker, ini yang paling cepat
// dibaca — tinggal cari huruf yang sama di papan.
export type LabelMode = "huruf" | "senarJari" | "senarNada" | "nama";

const KEY = "guru-biola-label";
const EVENT = "guru-biola-label-change";

export const LABEL_MODES: { v: LabelMode; label: string; contoh: string }[] = [
  { v: "huruf", label: "Huruf stiker", contoh: "C♯" },
  { v: "senarJari", label: "Senar + jari", contoh: "A2" },
  { v: "senarNada", label: "Senar + nada", contoh: "A–C♯" },
  { v: "nama", label: "Nama nada", contoh: "C♯5" },
];

const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

// Senar biola dari yang paling tebal. Posisi 1 saja — di luar itu, jarinya
// bukan lagi urusan senar mana, tapi posisi berapa, dan itu bukan level orang
// yang masih belajar nama nada.
const STRINGS = [
  { name: "G", open: 55 },
  { name: "D", open: 62 },
  { name: "A", open: 69 },
  { name: "E", open: 76 },
];

// Jarak semitone dari senar kosong → nomor jari yang lazim di posisi 1.
const FINGER_BY_SEMITONE: Record<number, number> = {
  0: 0,
  1: 1,
  2: 1,
  3: 2,
  4: 2,
  5: 3,
  6: 3,
  7: 4,
};

export function noteName(midi: number): string {
  return NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

// Senar mana yang paling masuk akal buat nada ini: senar tertinggi yang masih
// bisa menjangkaunya di posisi 1. Itu yang dipakai pemain sungguhan — makin
// sedikit pindah tangan, makin gampang.
export function stringAndFinger(
  midi: number
): { string: string; finger: number } | null {
  for (let i = STRINGS.length - 1; i >= 0; i--) {
    const diff = midi - STRINGS[i].open;
    if (diff >= 0 && diff <= 7) {
      const finger = FINGER_BY_SEMITONE[diff];
      if (finger !== undefined) return { string: STRINGS[i].name, finger };
    }
  }
  return null;
}

export function labelFor(midi: number, mode: LabelMode): string {
  // Huruf saja — sama persis dengan tulisan di stiker fingerboard.
  if (mode === "huruf") return NAMES[((midi % 12) + 12) % 12];
  if (mode === "nama") return noteName(midi);
  const sf = stringAndFinger(midi);
  // Di luar posisi 1, label senar+jari jadi bohong — jatuh balik ke nama nada.
  if (!sf) return noteName(midi);
  if (mode === "senarJari") return `${sf.string}${sf.finger}`;
  return `${sf.string}–${NAMES[((midi % 12) + 12) % 12]}`;
}

// Penjelasan panjang buat ditampilkan sekali, bukan di tiap not.
export function labelHint(midi: number, mode: LabelMode): string {
  const sf = stringAndFinger(midi);
  if (!sf) return `${noteName(midi)} — di luar posisi 1`;
  const jari =
    sf.finger === 0 ? "senar kosong (tanpa jari)" : `jari ${sf.finger}`;
  return mode === "nama"
    ? `senar ${sf.string}, ${jari}`
    : `${noteName(midi)} — senar ${sf.string}, ${jari}`;
}

// Bawaannya huruf stiker: biola pemula di Indonesia hampir selalu datang
// dengan stiker huruf, dan itu patokan pertama yang dipakai muridnya.
let current: LabelMode = "huruf";
if (typeof window !== "undefined") {
  const saved = localStorage.getItem(KEY) as LabelMode | null;
  if (
    saved === "huruf" ||
    saved === "nama" ||
    saved === "senarNada" ||
    saved === "senarJari"
  ) {
    current = saved;
  }
}

export function getLabelMode(): LabelMode {
  return current;
}

export function setLabelMode(m: LabelMode) {
  current = m;
  localStorage.setItem(KEY, m);
  window.dispatchEvent(new Event(EVENT));
}

export function useLabelMode(): LabelMode {
  const [m, setM] = useState<LabelMode>("huruf");
  useEffect(() => {
    setM(getLabelMode());
    const on = () => setM(getLabelMode());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return m;
}
