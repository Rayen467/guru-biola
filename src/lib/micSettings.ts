"use client";

// Sensitivitas mic dipakai bareng semua halaman yang dengerin biola.
// Disimpan biar cukup diatur sekali di /tuner.

import { useEffect, useState } from "react";

const KEY = "guru-biola-sensitivity";
const EVENT = "guru-biola-sensitivity-change";

export const DEFAULT_SENSITIVITY = 0.5;

let value = DEFAULT_SENSITIVITY;
if (typeof window !== "undefined") {
  // Number(null) itu 0 — kalau langsung dipakai, setelan bawaannya jadi
  // "paling ketat" buat semua orang yang belum pernah nyentuh slider ini.
  const raw = localStorage.getItem(KEY);
  const saved = raw === null ? NaN : Number(raw);
  if (Number.isFinite(saved) && saved >= 0 && saved <= 1) value = saved;
}

export function getSensitivity(): number {
  return value;
}

export function setSensitivity(v: number) {
  value = Math.min(1, Math.max(0, v));
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, String(value));
    window.dispatchEvent(new Event(EVENT));
  }
}

export function useSensitivity(): number {
  const [v, setV] = useState(DEFAULT_SENSITIVITY);
  useEffect(() => {
    setV(getSensitivity());
    const on = () => setV(getSensitivity());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return v;
}

export function sensitivityLabel(v: number): string {
  if (v <= 0.2) return "Ketat — ruangan berisik";
  if (v <= 0.4) return "Agak ketat";
  if (v <= 0.6) return "Normal";
  if (v <= 0.8) return "Agak longgar";
  return "Longgar — mic lemah / gesekan pelan";
}
