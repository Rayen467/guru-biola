"use client";

// Pelatih gesekan: nerjemahin sinyal mic jadi instruksi bowing.
// Dipakai di tuner, intonasi, mode lagu, dan latihan ritme.
//
// Aturan utama komponen ini: PESANNYA HARUS SEMPAT DIBACA.
// Sinyal mic berubah 60x per detik, jadi kalau pesannya ikut sinyal mentah,
// tulisannya kedap-kedip dan malah bikin pusing — persis keluhan yang bikin
// bagian ini ditulis ulang. Dua penahan dipasang:
//   1. keadaan baru harus BERTAHAN 700 ms sebelum diakui
//   2. pesan yang udah tampil dipegang minimal 1,6 detik sebelum boleh ganti
// Kalimatnya juga dipendekin: satu baris keadaan + satu baris tindakan.
// Penjelasan panjang pindah ke /mic.

import { useEffect, useRef, useState } from "react";

const SILENT_DB = -55; // di bawah ini = senyap / nyaris gak ada suara
const QUIET_DB = -38; // di bawah ini = ada suara tapi kekecilan buat dianalisis
const CLIP_PEAK = 0.97; // di atas ini = pecah/clipping

const SETTLE_MS = 700; // keadaan baru harus bertahan segini
const HOLD_MS = 1600; // pesan lama dipegang segini sebelum boleh diganti

type StateKey = "calibrating" | "clip" | "ok" | "other" | "silent" | "quiet" | "rough";

const MESSAGES: Record<
  StateKey,
  { emoji: string; title: string; tip: string; tone: "good" | "warn" | "muted" }
> = {
  calibrating: {
    emoji: "🎚️",
    title: "Ngukur suara ruangan",
    tip: "Diem sebentar, jangan gesek dulu.",
    tone: "muted",
  },
  clip: {
    emoji: "📢",
    title: "Kegedean — suaranya pecah",
    tip: "Jauhin mic, atau gesek lebih lembut.",
    tone: "warn",
  },
  ok: {
    emoji: "✓",
    title: "Kebaca jelas",
    tip: "",
    tone: "good",
  },
  other: {
    emoji: "🛡️",
    title: "Suara lain diabaikan",
    tip: "Bukan dawai — tinggal gesek biolanya.",
    tone: "muted",
  },
  silent: {
    emoji: "🔇",
    title: "Belum ada suara masuk",
    tip: "Gesek senarnya.",
    tone: "muted",
  },
  quiet: {
    emoji: "🔉",
    title: "Kekecilan",
    tip: "Gesek lebih mantap, atau deketin mic.",
    tone: "warn",
  },
  rough: {
    emoji: "🌫️",
    title: "Bunyinya belum bersih",
    tip: "Pelanin gesekan, tekanan sedang, bow di tengah antara jembatan dan fingerboard.",
    tone: "warn",
  },
};

export default function BowFeedback({
  active,
  freq,
  volumeDb,
  peak,
  noisy = false,
  calibrating = false,
  reason,
}: {
  active: boolean;
  freq: number | null;
  volumeDb: number;
  peak: number;
  noisy?: boolean;
  calibrating?: boolean;
  noiseFloorDb?: number;
  reason?: string;
}) {
  const key: StateKey = calibrating
    ? "calibrating"
    : peak > CLIP_PEAK
      ? "clip"
      : freq !== null
        ? "ok"
        : noisy && reason === "timbre"
          ? "other"
          : volumeDb < SILENT_DB
            ? "silent"
            : volumeDb < QUIET_DB
              ? "quiet"
              : "rough";

  const [shown, setShown] = useState<StateKey>("silent");
  const [hidden, setHidden] = useState(false);
  const candidate = useRef<{ key: StateKey; since: number }>({
    key,
    since: 0,
  });
  const shownAt = useRef(0);

  useEffect(() => {
    setHidden(localStorage.getItem("guru-biola-hide-bowtips") === "1");
  }, []);

  useEffect(() => {
    if (!active) return;
    const now = performance.now();
    if (candidate.current.key !== key) {
      candidate.current = { key, since: now };
      return;
    }
    if (key === shown) return;
    const settled = now - candidate.current.since >= SETTLE_MS;
    const held = now - shownAt.current >= HOLD_MS;
    if (settled && held) {
      shownAt.current = now;
      setShown(key);
    }
  }, [key, shown, active]);

  if (!active) return null;

  if (hidden) {
    return (
      <button
        onClick={() => {
          localStorage.removeItem("guru-biola-hide-bowtips");
          setHidden(false);
        }}
        className="text-[11px] text-muted underline-offset-2 hover:underline"
      >
        tampilkan lagi petunjuk gesekan
      </button>
    );
  }

  const m = MESSAGES[shown];
  // Tinggi batang ngikut volume sebenarnya — ini yang berubah cepat, dan
  // memang boleh: batang itu meteran, bukan tulisan yang harus dibaca.
  const level = Math.max(0, Math.min(1, (volumeDb + 60) / 55));

  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
        m.tone === "good"
          ? "border-good/40 bg-good/10"
          : m.tone === "warn"
            ? "border-accent/40 bg-accent/10"
            : "border-border-soft bg-surface-2"
      }`}
    >
      <span className="flex h-6 shrink-0 items-end gap-0.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`listen-bar w-1 rounded-sm ${
              m.tone === "good" ? "bg-good" : m.tone === "warn" ? "bg-accent" : "bg-muted"
            }`}
            style={{ height: `${20 + level * 80}%` }}
          />
        ))}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block text-sm font-semibold ${
            m.tone === "good"
              ? "text-good"
              : m.tone === "warn"
                ? "text-accent-strong"
                : "text-muted"
          }`}
        >
          {m.emoji} {m.title}
        </span>
        {m.tip && <span className="block text-xs text-muted">{m.tip}</span>}
      </span>

      <button
        onClick={() => {
          localStorage.setItem("guru-biola-hide-bowtips", "1");
          setHidden(true);
        }}
        title="Sembunyikan petunjuk ini"
        className="shrink-0 rounded-full px-2 py-1 text-xs text-muted hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}
