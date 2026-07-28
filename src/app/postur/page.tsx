"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LM,
  analyseBow,
  assess,
  type Point,
  type PostureReading,
} from "@/lib/posture";
import AnalysisCard, { type Analysis } from "@/components/AnalysisCard";

// Pelatih postur pakai kamera.
//
// Kenapa perlu: nada bisa dinilai komputer lewat mic, tapi postur salah baru
// kelihatan kalau ada yang ngeliatin dari luar. Postur yang salah bukan soal
// gaya — kaki rapat bikin badan goyang, bahu naik bikin bunyi tegang dan pegal,
// scroll turun bikin senar G gak kejangkau, bow nyapu bikin bunyi ngesot.
//
// Semua diproses di perangkat sendiri: model pose-nya ikut di-host bareng app,
// dan gambar kamera GAK PERNAH dikirim ke mana pun.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const TRACK_MS = 2500; // panjang jejak pergelangan yang dianalisis

const SKELETON: [number, number][] = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
];

export default function PosturPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const landmarkerRef = useRef<unknown>(null);
  const trackRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);

  const [status, setStatus] = useState<"idle" | "loading" | "live" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<PostureReading | null>(null);
  const [leftHanded, setLeftHanded] = useState(false);
  const [best, setBest] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  // Berapa lama tiap cek BERTAHAN bener sepanjang sesi. Satu frame bagus itu
  // gampang; yang dinilai porsi waktunya.
  const tallyRef = useRef<{
    frames: number;
    okByCheck: Record<string, number>;
    seenByCheck: Record<string, number>;
    labels: Record<string, string>;
    fixes: Record<string, string>;
    scoreSum: number;
    startedAt: number;
  }>({
    frames: 0,
    okByCheck: {},
    seenByCheck: {},
    labels: {},
    fixes: {},
    scoreSum: 0,
    startedAt: 0,
  });
  const leftHandedRef = useRef(false);
  leftHandedRef.current = leftHanded;

  const stop = useCallback(() => {
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
    setAnalysis(buildPostureAnalysis(tallyRef.current));
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("loading");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Browser ini gak ngasih akses kamera. Pakai Chrome/Edge/Brave versi baru, dan halamannya harus HTTPS."
        );
      }

      // Modelnya berat (±16 MB) — dimuat sekali, terus disimpan browser.
      const vision = await import("@mediapipe/tasks-vision");
      if (!landmarkerRef.current) {
        const fileset = await vision.FilesetResolver.forVisionTasks(
          `${BASE}/pose/wasm`
        );
        landmarkerRef.current = await vision.PoseLandmarker.createFromOptions(
          fileset,
          {
            baseOptions: {
              modelAssetPath: `${BASE}/pose/pose_landmarker_lite.task`,
            },
            runningMode: "VIDEO",
            numPoses: 1,
          }
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      trackRef.current = [];
      tallyRef.current = {
        frames: 0,
        okByCheck: {},
        seenByCheck: {},
        labels: {},
        fixes: {},
        scoreSum: 0,
        startedAt: performance.now(),
      };
      setAnalysis(null);
      runningRef.current = true;
      setStatus("live");

      const loop = () => {
        if (!runningRef.current) return;
        const lmk = landmarkerRef.current as {
          detectForVideo: (
            v: HTMLVideoElement,
            t: number
          ) => { landmarks: Point[][] };
        };
        const now = performance.now();
        const res = lmk.detectForVideo(video, now);
        const pose = res.landmarks?.[0];

        const canvas = canvasRef.current;
        if (canvas && video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (pose) {
            drawPose(ctx, pose, canvas.width, canvas.height);

            // jejak pergelangan tangan bow
            const bowWrist = leftHandedRef.current
              ? pose[LM.leftWrist]
              : pose[LM.rightWrist];
            if (bowWrist && (bowWrist.visibility ?? 1) > 0.5) {
              trackRef.current.push({ x: bowWrist.x, y: bowWrist.y, t: now });
              trackRef.current = trackRef.current.filter(
                (p) => now - p.t <= TRACK_MS
              );
            }

            const bow = analyseBow({ points: trackRef.current });
            const r = assess(pose, bow, leftHandedRef.current);
            setReading(r);
            setBest((b) => (b === null ? r.score : Math.max(b, r.score)));

            const t = tallyRef.current;
            t.frames++;
            t.scoreSum += r.score;
            for (const c of r.checks) {
              if (!c.measurable) continue;
              t.seenByCheck[c.id] = (t.seenByCheck[c.id] ?? 0) + 1;
              if (c.ok) t.okByCheck[c.id] = (t.okByCheck[c.id] ?? 0) + 1;
              t.labels[c.id] = c.label;
              t.fixes[c.id] = c.fix;
            }
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Akses kamera ditolak. Klik ikon gembok di address bar → Camera → Allow, terus muat ulang."
          : "Gagal mulai kamera: " + String(e)
      );
    }
  }, []);

  useEffect(() => stop, [stop]);

  const measurable = reading?.checks.filter((c) => c.measurable) ?? [];
  const problems = measurable.filter((c) => !c.ok);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">🧍 Pelatih Postur (kamera)</h1>
        <p className="mt-1 text-sm text-muted">
          Nada bisa dinilai lewat mic, tapi postur salah cuma kelihatan dari
          luar. Berdiri 2-3 meter dari kamera, badan sampai kaki masuk frame,
          terus main seperti biasa.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          {error}
        </div>
      )}

      {/* Panduan siap-siap — tanpa ini hasilnya sering "gak kelihatan" terus */}
      {status !== "live" && (
        <ol className="grid gap-2 sm:grid-cols-3">
          {[
            {
              n: "1",
              t: "Taruh HP/laptop jauh",
              d: "2-3 meter, setinggi pinggang. Badan sampai KAKI harus masuk frame — kalau kaki kepotong, kuda-kuda gak bisa dinilai.",
            },
            {
              n: "2",
              t: "Hadap kamera",
              d: "Badan menghadap kamera, tangan bow jangan ketutupan badan. Ruangan jangan gelap.",
            },
            {
              n: "3",
              t: "Main seperti biasa",
              d: "Gesek nada panjang bolak-balik 30 detik. Jangan pose — yang dinilai postur pas MAIN.",
            },
          ].map((s) => (
            <li
              key={s.n}
              className="rounded-xl border border-border-soft bg-surface p-3"
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs text-background">
                  {s.n}
                </span>
                {s.t}
              </div>
              <p className="mt-1 text-xs text-muted">{s.d}</p>
            </li>
          ))}
        </ol>
      )}

      <div className="rounded-2xl border border-border-soft bg-surface p-4">
        <div className="relative overflow-hidden rounded-xl bg-black">
          {/* dicerminkan biar kayak ngaca */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full -scale-x-100"
          />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
          />
          {status !== "live" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted">
              <span className="text-4xl">🎥</span>
              {status === "loading"
                ? "Nyiapin model postur… (±16 MB, sekali doang)"
                : "Kamera mati"}
            </div>
          )}
          {reading && status === "live" && (
            <div className="absolute left-3 top-3 rounded-full bg-background/80 px-3 py-1 text-sm font-bold text-accent-strong">
              {reading.score}%
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={status === "live" ? stop : start}
            disabled={status === "loading"}
            className={`rounded-full px-6 py-2.5 font-semibold transition-colors disabled:opacity-50 ${
              status === "live"
                ? "bg-surface-2 text-foreground hover:bg-border-soft"
                : "bg-accent text-background hover:bg-accent-strong"
            }`}
          >
            {status === "live"
              ? "■ Stop kamera"
              : status === "loading"
                ? "⏳ Nyiapin…"
                : "🎥 Nyalain kamera"}
          </button>
          <button
            onClick={() => setLeftHanded((v) => !v)}
            className={`rounded-full px-4 py-2.5 text-sm transition-colors ${
              leftHanded
                ? "bg-accent/20 text-accent-strong"
                : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {leftHanded ? "Kidal: biola di bahu kanan" : "Standar: biola di bahu kiri"}
          </button>
        </div>
      </div>

      <AnalysisCard analysis={analysis} onClose={() => setAnalysis(null)} />

      {/* Daftar periksa */}
      {reading && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Periksa postur{" "}
              <span className="text-sm font-normal text-muted">
                {measurable.filter((c) => c.ok).length}/{measurable.length} beres
              </span>
            </h2>
            {best !== null && (
              <span className="text-xs text-muted">terbaik sesi ini: {best}%</span>
            )}
          </div>

          <ul className="space-y-2">
            {reading.checks.map((c) => (
              <li
                key={c.id}
                className={`animate-fade-up rounded-xl border p-3 ${
                  !c.measurable
                    ? "border-border-soft bg-surface opacity-60"
                    : c.ok
                      ? "border-good/40 bg-good/10"
                      : "border-accent/40 bg-accent/10"
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span>{!c.measurable ? "⚪" : c.ok ? "✅" : "⚠️"}</span>
                  <span className="flex-1">{c.label}</span>
                  <span className="font-mono text-xs text-muted">{c.value}</span>
                </div>
                {c.target && (
                  <p className="mt-1 text-[11px] text-muted">🎯 {c.target}</p>
                )}
                {!c.ok && c.measurable && (
                  <p className="mt-1 rounded-lg bg-background/40 p-2 text-xs">
                    <b className="text-accent-strong">Benerinnya:</b> {c.fix}
                  </p>
                )}
                {!c.measurable && (
                  <p className="mt-1 text-xs text-muted">{c.fix}</p>
                )}
              </li>
            ))}
          </ul>

          {problems.length > 0 && (
            <div className="rounded-xl border border-accent/40 bg-surface p-4">
              <h3 className="text-sm font-semibold text-accent-strong">
                Benerin ini dulu
              </h3>
              <p className="mt-1 text-xs text-muted">
                Jangan benerin semua sekaligus — ambil satu, tahan 5 menit
                sampai kerasa normal, baru lanjut yang berikutnya. Urutan yang
                paling ngefek: kaki → badan → bahu → lengan → bow.
              </p>
              <p className="mt-2 text-sm">
                👉 <b>{problems[0].label}</b> — {problems[0].fix}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-border-soft bg-surface p-4 text-xs text-muted">
        <p>
          📷 <b className="text-foreground">Biar akurat:</b> berdiri menghadap
          kamera, jarak 2-3 meter, seluruh badan sampai kaki kelihatan, ruangan
          jangan gelap. Tangan bow jangan ketutupan badan.
        </p>
        <p>
          🔒 <b className="text-foreground">Privasi:</b> model pose-nya ikut
          disimpan bareng app ini dan jalan di perangkat lu. Gambar kamera gak
          direkam dan gak dikirim ke server mana pun.
        </p>
        <p>
          ⚖️ <b className="text-foreground">Batasnya:</b> kamera cuma lihat
          titik badan — dia gak bisa nilai pegangan jari bow atau tekanan.
          Anggap ini cermin yang bisa ngitung, bukan pengganti guru.
        </p>
      </div>
    </div>
  );
}

// Analisis akhir sesi: yang dilaporin PORSI WAKTU tiap cek bertahan bener,
// bukan potret sesaat. Postur yang cuma bener pas lagi diperhatiin itu belum
// jadi kebiasaan.
function buildPostureAnalysis(t: {
  frames: number;
  okByCheck: Record<string, number>;
  seenByCheck: Record<string, number>;
  labels: Record<string, string>;
  fixes: Record<string, string>;
  scoreSum: number;
  startedAt: number;
}): Analysis | null {
  const seconds = (performance.now() - t.startedAt) / 1000;
  // sesi kependekan gak layak dinilai
  if (t.frames < 60 || seconds < 8) return null;

  const rows = Object.keys(t.seenByCheck).map((id) => ({
    id,
    label: t.labels[id],
    fix: t.fixes[id],
    pct: Math.round(((t.okByCheck[id] ?? 0) / t.seenByCheck[id]) * 100),
  }));
  rows.sort((a, b) => a.pct - b.pct);

  const avg = Math.round(t.scoreSum / t.frames);
  const verdicts = [];

  const worst = rows[0];
  if (worst && worst.pct < 70) {
    verdicts.push({
      icon: "🎯",
      title: `Paling sering meleset: ${worst.label} (bener cuma ${worst.pct}% waktu)`,
      detail: worst.fix,
      tone: (worst.pct < 40 ? "bad" : "warn") as "bad" | "warn",
    });
  }

  const stable = rows.filter((r) => r.pct >= 85);
  if (stable.length) {
    verdicts.push({
      icon: "✅",
      title: `Udah jadi kebiasaan: ${stable.map((r) => r.label).join(", ")}`,
      detail: "Bagian ini bener tanpa perlu lu pikirin lagi. Jangan diutak-atik.",
      tone: "good" as const,
    });
  }

  const middling = rows.filter((r) => r.pct >= 40 && r.pct < 85);
  if (middling.length) {
    verdicts.push({
      icon: "🔁",
      title: `Masih goyang: ${middling.map((r) => `${r.label} ${r.pct}%`).join(" · ")}`,
      detail:
        "Bener kalau lagi inget, salah lagi begitu fokus pindah ke nada. Ini normal — tandanya belum otomatis, bukan belum ngerti.",
      tone: "warn" as const,
    });
  }

  verdicts.push({
    icon: "⏱️",
    title: `${Math.round(seconds)} detik terpantau`,
    detail:
      seconds < 30
        ? "Sesi pendek. Buat gambaran yang jujur, main minimal 30 detik — postur biasanya baru melorot setelah beberapa gesekan."
        : "Durasinya cukup buat ngeliat mana yang bertahan dan mana yang melorot.",
    tone: seconds < 30 ? ("warn" as const) : ("good" as const),
  });

  return {
    score: avg,
    headline: "Analisis postur",
    subline: `Rata-rata ${avg}% cek lolos · ${rows.length} hal terukur · urutan benerin: dari yang persentasenya paling kecil`,
    verdicts,
  };
}

function drawPose(
  ctx: CanvasRenderingContext2D,
  pose: Point[],
  w: number,
  h: number
) {
  ctx.lineWidth = Math.max(2, w / 300);
  ctx.strokeStyle = "rgba(245,185,80,0.85)";
  for (const [a, b] of SKELETON) {
    const pa = pose[a];
    const pb = pose[b];
    if (!pa || !pb) continue;
    if ((pa.visibility ?? 1) < 0.4 || (pb.visibility ?? 1) < 0.4) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * w, pa.y * h);
    ctx.lineTo(pb.x * w, pb.y * h);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(74,222,128,0.9)";
  for (const p of pose) {
    if ((p.visibility ?? 1) < 0.4) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, Math.max(2, w / 250), 0, Math.PI * 2);
    ctx.fill();
  }
}
