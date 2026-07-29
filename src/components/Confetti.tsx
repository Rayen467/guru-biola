"use client";

// Ledakan kertas warna sekali jalan, buat momen yang memang layak dirayakan
// (lagu tuntas). Sengaja pakai elemen CSS biasa, bukan canvas: jumlahnya
// sedikit, umurnya 1,4 detik, lalu dibuang — gak ada loop yang jalan terus di
// belakang layar.

import { useEffect, useState } from "react";

const WARNA = ["var(--accent)", "var(--accent-strong)", "var(--good)", "#f3ece2"];

export default function Confetti({ trigger }: { trigger: unknown }) {
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (!trigger) return;
    setBurst((b) => b + 1);
    // Dibersihkan sendiri setelah animasinya habis.
    const id = window.setTimeout(() => setBurst(0), 1600);
    return () => window.clearTimeout(id);
  }, [trigger]);

  if (!burst) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center overflow-visible">
      <div className="relative h-0 w-0">
        {Array.from({ length: 26 }).map((_, i) => {
          const spread = (i / 25 - 0.5) * 320;
          return (
            <span
              key={`${burst}-${i}`}
              className="confetti-bit"
              style={
                {
                  left: 0,
                  background: WARNA[i % WARNA.length],
                  animationDelay: `${(i % 6) * 45}ms`,
                  "--cx": `${spread}px`,
                  "--cr": `${(i % 2 ? 1 : -1) * (360 + i * 20)}deg`,
                } as React.CSSProperties
              }
            />
          );
        })}
      </div>
    </div>
  );
}
