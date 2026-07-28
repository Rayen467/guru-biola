"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DAILY_TARGET_SECONDS,
  badges,
  dailyQuests,
  levelFromSeconds,
  type Badge,
  type Quest,
} from "@/lib/badges";
import {
  formatDuration,
  loadProgress,
  practiceStats,
  type PracticeStats,
  type Progress,
} from "@/lib/progress";

export default function PencapaianPage() {
  const [p, setP] = useState<Progress | null>(null);
  const [stats, setStats] = useState<PracticeStats | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const loaded = loadProgress();
    setP(loaded);
    setStats(practiceStats(loaded));
  }, []);

  // Kartu pamer: digambar di canvas, jadi bisa dibagikan sebagai gambar ke
  // WhatsApp/IG story tanpa perlu screenshot yang kepotong.
  const buildCard = useCallback((): Promise<Blob | null> => {
    const canvas = canvasRef.current;
    if (!canvas || !p || !stats) return Promise.resolve(null);
    const W = 1080;
    const H = 1080;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);

    const lv = levelFromSeconds(stats.totalSeconds);
    const earned = badges(p).filter((b) => b.earned);

    ctx.fillStyle = "#16110c";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#211a13";
    ctx.fillRect(60, 60, W - 120, H - 120);

    ctx.fillStyle = "#f5b950";
    ctx.font = "bold 64px sans-serif";
    ctx.fillText("🎻 Guru Biola", 110, 180);

    ctx.fillStyle = "#a8988a";
    ctx.font = "32px sans-serif";
    ctx.fillText(`Level ${lv.level} — ${lv.title}`, 110, 240);

    ctx.fillStyle = "#f3ece2";
    ctx.font = "bold 140px sans-serif";
    ctx.fillText(`${stats.streak}`, 110, 420);
    ctx.font = "36px sans-serif";
    ctx.fillStyle = "#a8988a";
    ctx.fillText("hari berturut-turut 🔥", 110, 470);

    ctx.fillStyle = "#f3ece2";
    ctx.font = "bold 72px sans-serif";
    ctx.fillText(formatDuration(stats.totalSeconds), 110, 600);
    ctx.font = "32px sans-serif";
    ctx.fillStyle = "#a8988a";
    ctx.fillText(`total latihan · ${stats.activeDays} hari aktif`, 110, 650);

    // deretan lencana
    ctx.font = "64px sans-serif";
    earned.slice(0, 10).forEach((b, i) => {
      ctx.fillText(b.emoji, 110 + (i % 5) * 100, 780 + Math.floor(i / 5) * 100);
    });

    ctx.fillStyle = "#e8a33d";
    ctx.font = "28px sans-serif";
    ctx.fillText("rayen467.github.io/guru-biola", 110, H - 110);

    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }, [p, stats]);

  const share = async () => {
    const blob = await buildCard();
    if (!blob) return;
    const file = new File([blob], "progres-biola.png", { type: "image/png" });
    // Web Share API kalau ada (HP), kalau nggak ya diunduh.
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean;
    };
    if (nav.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Progres latihan biola" });
        setShareMsg("Kartu dibagikan.");
        return;
      } catch {
        // dibatalin user — jatuh ke unduhan
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "progres-biola.png";
    a.click();
    URL.revokeObjectURL(url);
    setShareMsg("Kartu diunduh — tinggal kirim.");
  };

  if (!p || !stats) {
    return <div className="text-sm text-muted">Memuat pencapaian…</div>;
  }

  const list = badges(p);
  const quests = dailyQuests(p, stats.todaySeconds);
  const lv = levelFromSeconds(stats.totalSeconds);
  const earned = list.filter((b) => b.earned);
  const locked = list.filter((b) => !b.earned);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold">🏅 Pencapaian</h1>
        <p className="mt-1 text-sm text-muted">
          Semua dihitung dari latihan yang beneran kecatat. Gak ada lencana yang
          bisa didapet cuma dengan buka app.
        </p>
      </header>

      {/* Level dari jam terbang */}
      <section className="rounded-xl border border-border-soft bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">
              Level {lv.level}
            </div>
            <div className="text-2xl font-bold text-accent-strong">
              {lv.title}
            </div>
          </div>
          <div className="text-right text-sm text-muted">
            {formatDuration(stats.totalSeconds)} /{" "}
            {formatDuration(lv.nextAt)} ke level berikutnya
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${lv.intoLevel * 100}%` }}
          />
        </div>
      </section>

      {/* Misi hari ini */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Misi hari ini</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {quests.map((q: Quest) => (
            <li key={q.id}>
              <Link
                href={q.href}
                className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                  q.done
                    ? "border-good/40 bg-good/10"
                    : "border-border-soft bg-surface hover:border-accent"
                }`}
              >
                <span className="text-xl">{q.done ? "✅" : "⬜"}</span>
                <span
                  className={`flex-1 text-sm ${q.done ? "text-muted line-through" : ""}`}
                >
                  {q.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="rounded-xl border border-border-soft bg-surface p-4">
          <div className="flex items-center justify-between text-sm">
            <span>Latihan hari ini</span>
            <span className="font-semibold text-accent-strong">
              {formatDuration(stats.todaySeconds)} /{" "}
              {formatDuration(DAILY_TARGET_SECONDS)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full transition-all ${
                stats.todaySeconds >= DAILY_TARGET_SECONDS
                  ? "bg-good"
                  : "bg-accent"
              }`}
              style={{
                width: `${Math.min(100, (stats.todaySeconds / DAILY_TARGET_SECONDS) * 100)}%`,
              }}
            />
          </div>
        </div>
      </section>

      {/* Lencana */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Lencana {earned.length}/{list.length}
          </h2>
          <button
            onClick={share}
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-background hover:bg-accent-strong"
          >
            📤 Bagikan kartu progres
          </button>
        </div>
        {shareMsg && <p className="text-xs text-good">{shareMsg}</p>}
        <canvas ref={canvasRef} className="hidden" />

        <div className="grid gap-2 sm:grid-cols-2">
          {[...earned, ...locked].map((b: Badge) => (
            <div
              key={b.id}
              className={`flex items-start gap-3 rounded-xl border p-3 ${
                b.earned
                  ? "border-accent/40 bg-accent/10"
                  : "border-border-soft bg-surface"
              }`}
            >
              <span className={`text-2xl ${b.earned ? "" : "opacity-30 grayscale"}`}>
                {b.emoji}
              </span>
              <div className="flex-1">
                <div className="text-sm font-semibold">
                  {b.title}
                  {b.earned && <span className="ml-2 text-xs text-good">✓</span>}
                </div>
                <div className="text-xs text-muted">{b.desc}</div>
                {!b.earned && (
                  <>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full bg-accent/60"
                        style={{ width: `${b.progress * 100}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-muted">{b.hint}</div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-muted">
        Lencana disimpan di browser ini bareng catatan latihan. Mau pindah HP?
        Ekspor dulu dari{" "}
        <Link href="/statistik" className="text-accent-strong underline">
          statistik
        </Link>
        .
      </p>
    </div>
  );
}
