"use client";

// Pelatih gesekan: nerjemahin sinyal mic jadi instruksi bowing.
// Dipakai di tuner, intonasi, dan mode lagu.

const SILENT_DB = -55; // di bawah ini = senyap / nyaris gak ada suara
const QUIET_DB = -38; // di bawah ini = ada suara tapi kekecilan buat dianalisis
const CLIP_PEAK = 0.97; // di atas ini = pecah/clipping

export default function BowFeedback({
  active,
  freq,
  volumeDb,
  peak,
}: {
  active: boolean;
  freq: number | null;
  volumeDb: number;
  peak: number;
}) {
  if (!active) return null;

  let emoji: string;
  let title: string;
  let tip: string | null;
  let tone: "good" | "warn" | "muted";

  if (peak > CLIP_PEAK) {
    emoji = "📢";
    title = "KEGEDEAN — suaranya pecah di mic";
    tip = "Jauhin biola dari mic dikit, atau gesek lebih lembut. Suara pecah = deteksi ngaco.";
    tone = "warn";
  } else if (freq !== null) {
    emoji = "✓";
    title = "Suara jernih, kebaca jelas";
    tip = null;
    tone = "good";
  } else if (volumeDb < SILENT_DB) {
    emoji = "🔇";
    title = "Senyap — gak ada suara masuk";
    tip = "Gesek senarnya. Bow nempel senar, tarik pakai berat lengan, jangan takut-takut.";
    tone = "muted";
  } else if (volumeDb < QUIET_DB) {
    emoji = "🔉";
    title = "KEKECILAN — suara ada tapi tipis";
    tip = "Gesek lebih mantap: tekanan dikit lebih berat (dari berat lengan, bukan diteken jari) dan bow jalan lebih niat. Atau deketin mic.";
    tone = "warn";
  } else {
    emoji = "🌫️";
    title = "CEMPRENG / gak jernih — volume cukup tapi nadanya gak kebaca";
    tip = "Biasanya: bow keteken terlalu keras, gesekan kecepetan, bow miring, atau kurang rosin. Pelanin gesekan (±1 detik per arah), tekanan sedang, jalur bow di tengah antara jembatan dan fingerboard.";
    tone = "warn";
  }

  return (
    <div
      className={`rounded-lg border p-2.5 text-left text-xs ${
        tone === "good"
          ? "border-good/40 bg-good/10 text-good"
          : tone === "warn"
            ? "border-accent/40 bg-accent/10 text-foreground"
            : "border-border-soft bg-surface-2 text-muted"
      }`}
    >
      <span className="font-semibold">
        {emoji} {title}
      </span>
      {tip && <span className="text-muted"> — {tip}</span>}
    </div>
  );
}
