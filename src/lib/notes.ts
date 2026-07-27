// Konversi frekuensi <-> nada. Standar A4 = 440 Hz, tapi bisa dikalibrasi:
// orkestra Eropa banyak yang main di 442–443, musik barok sering 415.

import { useEffect, useState } from "react";

export const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

export const DEFAULT_A4 = 440;
export const MIN_A4 = 415;
export const MAX_A4 = 446;

const A4_KEY = "guru-biola-a4";
const A4_EVENT = "guru-biola-a4-change";

// Dibaca sekali saat modul dimuat; halaman yang lagi kebuka disinkronkan lewat
// event, jadi kalibrasi di tuner langsung kepakai di intonasi/lagu tanpa reload.
let a4 = DEFAULT_A4;
if (typeof window !== "undefined") {
  const saved = Number(localStorage.getItem(A4_KEY));
  if (saved >= MIN_A4 && saved <= MAX_A4) a4 = saved;
}

export function getA4(): number {
  return a4;
}

export function setA4(hz: number) {
  a4 = Math.min(MAX_A4, Math.max(MIN_A4, Math.round(hz)));
  if (typeof window !== "undefined") {
    localStorage.setItem(A4_KEY, String(a4));
    window.dispatchEvent(new Event(A4_EVENT));
  }
}

// Bikin komponen ikut render ulang tiap kalibrasi berubah.
export function useA4(): number {
  const [hz, setHz] = useState(DEFAULT_A4);
  useEffect(() => {
    setHz(getA4());
    const on = () => setHz(getA4());
    window.addEventListener(A4_EVENT, on);
    return () => window.removeEventListener(A4_EVENT, on);
  }, []);
  return hz;
}

export interface NoteInfo {
  name: string;      // contoh: "A4"
  freq: number;      // frekuensi ideal nada terdekat
  cents: number;     // selisih dari nada ideal, -50..+50
  midi: number;
}

export function freqToNote(freq: number): NoteInfo {
  const midiFloat = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  const ideal = midiToFreq(midi);
  const name = NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  return { name, freq: ideal, cents, midi };
}

export function midiToFreq(midi: number): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function midiToName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

// Selisih cent antara dua frekuensi. Positif = yang pertama lebih tinggi.
export function centsBetween(freq: number, ref: number): number {
  return 1200 * Math.log2(freq / ref);
}

// Senar biola (dari paling tebal/rendah): G3, D4, A4, E5.
// Frekuensinya sengaja TIDAK disimpan di sini — ikut kalibrasi A4 lewat
// midiToFreq(), jadi jangan di-cache di konstanta.
export const VIOLIN_STRINGS = [
  { name: "G", label: "G3 (paling tebal)", midi: 55 },
  { name: "D", label: "D4", midi: 62 },
  { name: "A", label: "A4", midi: 69 },
  { name: "E", label: "E5 (paling tipis)", midi: 76 },
] as const;
