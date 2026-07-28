"use client";

// Pelatih gesekan: nerjemahin sinyal mic jadi instruksi bowing.
// Dipakai di tuner, intonasi, mode lagu, dan latihan ritme.

const SILENT_DB = -55; // di bawah ini = senyap / nyaris gak ada suara
const QUIET_DB = -38; // di bawah ini = ada suara tapi kekecilan buat dianalisis
const CLIP_PEAK = 0.97; // di atas ini = pecah/clipping
const LOUD_ROOM_DB = -45; // suara latar di atas ini = ruangannya berisik

export default function BowFeedback({
  active,
  freq,
  volumeDb,
  peak,
  noisy = false,
  calibrating = false,
  noiseFloorDb = -100,
  reason,
}: {
  active: boolean;
  freq: number | null;
  volumeDb: number;
  peak: number;
  noisy?: boolean;
  calibrating?: boolean;
  noiseFloorDb?: number;
  // alasan penolakan dari detektor — bikin pesannya lebih tepat sasaran
  reason?: string;
}) {
  if (!active) return null;

  let emoji: string;
  let title: string;
  let tip: string | null;
  let tone: "good" | "warn" | "muted";

  if (calibrating) {
    emoji = "🎚️";
    title = "Ngukur suara ruangan… diem bentar";
    tip = "Sedetik doang. Ini yang bikin app bisa bedain gesekan lu dari kipas, TV, atau orang ngobrol.";
    tone = "muted";
  } else if (peak > CLIP_PEAK) {
    emoji = "📢";
    title = "KEGEDEAN — suaranya pecah di mic";
    tip = "Jauhin biola dari mic dikit, atau gesek lebih lembut. Suara pecah = deteksi ngaco.";
    tone = "warn";
  } else if (freq !== null) {
    emoji = "✓";
    title = "Suara jernih, kebaca jelas";
    tip = null;
    tone = "good";
  } else if (noisy) {
    emoji = "🔊";
    title = "Ada suara, TAPI bukan nada biola";
    tip =
      reason === "timbre"
        ? "Yang kedengeran itu suara orang / TV / speaker — bentuk harmoniknya beda dari dawai, jadi sengaja diabaikan. Aman, tinggal gesek biolanya."
        : noiseFloorDb > LOUD_ROOM_DB
          ? "Ruangannya berisik (kipas/AC/TV/orang ngomong). Matiin sumber suaranya, atau deketin mic ke biola — nada cuma dibaca kalau jelas lebih keras dari suara latar."
          : "Yang masuk mic bukan nada bertahan. Gesek satu senar panjang dan stabil, jangan ketok-ketok atau ngomong.";
    tone = "warn";
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

  // Tinggi batang ngikut volume sebenarnya (-60..-5 dB), jadi ini bukan
  // animasi hiasan: kalau batangnya pendek terus, gesekan lu emang kekecilan.
  const level = Math.max(0, Math.min(1, (volumeDb + 60) / 55));

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left text-xs transition-colors ${
        tone === "good"
          ? "border-good/40 bg-good/10 text-good"
          : tone === "warn"
            ? "border-accent/40 bg-accent/10 text-foreground"
            : "border-border-soft bg-surface-2 text-muted"
      }`}
    >
      <span
        className="flex h-6 shrink-0 items-end gap-0.5"
        aria-hidden
        title={`Volume masuk: ${Math.round(volumeDb)} dB`}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`listen-bar w-1 rounded-sm ${
              tone === "good" ? "bg-good" : tone === "warn" ? "bg-accent" : "bg-muted"
            }`}
            style={{ height: `${20 + level * 80}%` }}
          />
        ))}
      </span>
      <span className="flex-1">
        <span className="font-semibold">
          {emoji} {title}
        </span>
        {tip && <span className="text-muted"> — {tip}</span>}
      </span>
    </div>
  );
}
