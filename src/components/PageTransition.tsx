"use client";

// Animasi pindah halaman. Kuncinya dari alamat halaman: begitu alamat berubah,
// React menganggap ini elemen baru dan animasinya jalan lagi.
//
// Sengaja pendek (0,28 detik). Transisi panjang bikin app kerasa lambat, dan
// halaman di sini sering dibuka bolak-balik di tengah latihan.

import { usePathname } from "next/navigation";

export default function PageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname();
  return (
    <div key={path} className="page-in">
      {children}
    </div>
  );
}
