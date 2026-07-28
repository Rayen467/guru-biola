"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Beranda", emoji: "🏠" },
  { href: "/latihan", label: "Sesi Latihan", emoji: "🗓️" },
  { href: "/kurikulum", label: "Kurikulum", emoji: "🗺️" },
  { href: "/silabus", label: "Silabus", emoji: "📋" },
  { href: "/tuner", label: "Tuner", emoji: "🎯" },
  { href: "/intonasi", label: "Intonasi", emoji: "🎻" },
  { href: "/kuping", label: "Latih Kuping", emoji: "👂" },
  { href: "/metronome", label: "Metronom", emoji: "🥁" },
  { href: "/ritme", label: "Ritme", emoji: "⏱️" },
  { href: "/notasi", label: "Baca Not", emoji: "🎼" },
  { href: "/lagu", label: "Lagu", emoji: "🎵" },
  { href: "/rekam", label: "Rekam", emoji: "⏺️" },
  { href: "/postur", label: "Postur", emoji: "🧍" },
  { href: "/bow", label: "Pegang Bow", emoji: "🏹" },
  { href: "/fingerboard", label: "Fingerboard", emoji: "🖐️" },
  { href: "/pencapaian", label: "Pencapaian", emoji: "🏅" },
  { href: "/statistik", label: "Statistik", emoji: "📊" },
  { href: "/mic", label: "Diagnosa Mic", emoji: "🔬" },
  { href: "/guru", label: "Guru AI", emoji: "🧑‍🏫" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-20 border-b border-border-soft bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-2">
        <span className="mr-3 shrink-0 text-lg font-bold text-accent-strong">
          🎻 Guru Biola
        </span>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors ${
              path === l.href
                ? "bg-accent text-background font-semibold"
                : "text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <span className="mr-1">{l.emoji}</span>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
