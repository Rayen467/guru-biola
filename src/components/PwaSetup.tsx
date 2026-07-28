"use client";

// Daftarin service worker + tawarin pasang ke layar utama.
//
// Kenapa penting buat app ini: latihan biola sering di ruang latihan yang
// sinyalnya jelek. Sekali dipasang, semua halaman (tuner, metronom, intonasi)
// jalan tanpa internet — semua pemrosesan audio emang di HP sendiri.

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function PwaSetup() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Path-nya absolut dari basePath — kalau relatif, halaman dalam
      // (mis. /guru-biola/tuner/) bakal nyari sw.js di folder yang salah.
      navigator.serviceWorker.register(`${BASE}/sw.js`).catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!prompt || hidden) return null;

  return (
    <div className="mx-auto mb-4 flex max-w-5xl flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
      <span className="text-xl">📲</span>
      <div className="flex-1 text-sm">
        <b>Pasang di HP</b> — kebuka dari layar utama, jalan tanpa internet, dan
        mic-nya lebih stabil daripada di dalam tab browser.
      </div>
      <button
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }}
        className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-background hover:bg-accent-strong"
      >
        Pasang
      </button>
      <button
        onClick={() => setHidden(true)}
        className="rounded-full px-3 py-1.5 text-xs text-muted hover:text-foreground"
      >
        Nanti
      </button>
    </div>
  );
}
