"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  HAND_BONES,
  PushUpCounter,
  assessHand,
  type HandPoint,
  type HandReading,
} from "@/lib/bowHand";
import AnalysisCard, { type Analysis } from "@/components/AnalysisCard";

// Cek pegangan bow pakai kamera.
//
// Bedanya sama halaman teori: di sini tangan LU yang diukur. Model tangan
// ngasih 21 titik sendi, jadi sudut jempol dan kelingking bisa dihitung —
// dua hal yang paling sering salah dan paling susah dilihat sendiri karena
// tangannya lagi megang bow.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function BowKameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const landmarkerRef = useRef<unknown>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  const counterRef = useRef(new PushUpCounter());
  const holdRef = useRef({ okFrames: 0, total: 0 });
  // Kanvas bantu buat nyerahin gambar yang udah diterangin ke detektor.
  // Ruangan remang bikin model tangan gagal walau mata kita jelas lihat tangan.
  const prepRef = useRef<HTMLCanvasElement | null>(null);
  const boostRef = useRef(1);
  const [dark, setDark] = useState(false);
  // Kidal = biola di bahu kanan, bow di tangan kiri. Dipakai buat milih tangan
  // mana yang dinilai kalau dua-duanya kelihatan kamera.
  const [leftHanded, setLeftHanded] = useState(false);
  const leftHandedRef = useRef(false);
  leftHandedRef.current = leftHanded;

  const [status, setStatus] = useState<"idle" | "loading" | "live">("idle");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<HandReading | null>(null);
  const [handSeen, setHandSeen] = useState(false);
  const [reps, setReps] = useState(0);
  const [drill, setDrill] = useState<"cek" | "pushup">("cek");
  const [holdPct, setHoldPct] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const tallyRef = useRef({
    frames: 0,
    ok: {} as Record<string, number>,
    labels: {} as Record<string, string>,
    fixes: {} as Record<string, string>,
    thumbSum: 0,
    pinkySum: 0,
    scoreSum: 0,
    startedAt: 0,
  });

  const stop = useCallback(() => {
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
    setAnalysis(buildHandAnalysis(tallyRef.current, counterRef.current.reps));
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
      const vision = await import("@mediapipe/tasks-vision");
      if (!landmarkerRef.current) {
        const fileset = await vision.FilesetResolver.forVisionTasks(
          `${BASE}/pose/wasm`
        );
        landmarkerRef.current = await vision.HandLandmarker.createFromOptions(
          fileset,
          {
            baseOptions: {
              modelAssetPath: `${BASE}/pose/hand_landmarker.task`,
            },
            runningMode: "VIDEO",
            // DUA tangan: pas main biola, tangan kiri megang leher biola dan
            // ikut kelihatan kamera. Kalau cuma minta satu, yang kepilih bisa
            // tangan yang salah — atau gagal dua-duanya.
            numHands: 2,
            // Ambang bawaan (0,5) kekencengan buat ruangan remang dan tangan
            // yang sebagian ketutupan bow. Diturunin; hasil yang meragukan
            // tetap kesaring sama uji sudut di bawah.
            minHandDetectionConfidence: 0.3,
            minHandPresenceConfidence: 0.3,
            minTrackingConfidence: 0.3,
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

      counterRef.current.reset();
      holdRef.current = { okFrames: 0, total: 0 };
      tallyRef.current = {
        frames: 0,
        ok: {},
        labels: {},
        fixes: {},
        thumbSum: 0,
        pinkySum: 0,
        scoreSum: 0,
        startedAt: performance.now(),
      };
      setAnalysis(null);
      setReps(0);
      runningRef.current = true;
      setStatus("live");

      const loop = () => {
        if (!runningRef.current) return;
        const lmk = landmarkerRef.current as {
          detectForVideo: (
            v: HTMLVideoElement | HTMLCanvasElement,
            t: number
          ) => HandResult;
        };
        // 1) Terangin dulu gambarnya, baru dideteksi.
        const src = brighten(video, prepRef, boostRef, setDark);
        const res = lmk.detectForVideo(src, performance.now());
        // 2) Dari (mungkin) dua tangan, ambil TANGAN BOW-nya.
        const hand = pickBowHand(res, leftHandedRef.current);
        setHandSeen(!!hand);

        const canvas = canvasRef.current;
        if (canvas && video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (hand) {
            const r = assessHand(hand);
            setReading(r);
            drawHand(ctx, hand, canvas.width, canvas.height, r.score >= 80);

            const c = holdRef.current;
            c.total++;
            if (r.score >= 80) c.okFrames++;
            setHoldPct(Math.round((c.okFrames / Math.max(1, c.total)) * 100));

            const t = tallyRef.current;
            t.frames++;
            t.scoreSum += r.score;
            t.thumbSum += r.thumbAngle;
            t.pinkySum += r.pinkyAngle;
            for (const chk of r.checks) {
              if (chk.ok) t.ok[chk.id] = (t.ok[chk.id] ?? 0) + 1;
              t.labels[chk.id] = chk.label;
              t.fixes[chk.id] = chk.fix;
            }

            if (counterRef.current.update(r.thumbAngle)) {
              setReps(counterRef.current.reps);
            }
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      setStatus("idle");
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Akses kamera ditolak. Klik ikon gembok di address bar → Camera → Allow, terus muat ulang."
          : "Gagal mulai kamera: " + String(e)
      );
    }
  }, []);

  useEffect(() => stop, [stop]);

  const worst = reading?.checks
    .filter((c) => !c.ok)
    .sort((a, b) => b.weight - a.weight)[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">📷 Cek Pegangan Bow (kamera)</h1>
        <p className="mt-1 text-sm text-muted">
          Pegang bow seperti biasa, arahkan tangan ke kamera dari samping.
          Kamera ngukur sudut sendi jempol dan kelingking lu — dua hal yang
          paling sering salah dan paling susah dilihat sendiri.
        </p>
        <Link href="/bow" className="mt-2 inline-block text-xs text-accent-strong underline">
          ← balik ke teori pegangan bow
        </Link>
      </header>

      {error && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          {error}
        </div>
      )}

      {status !== "live" && (
        <ol className="grid gap-2 sm:grid-cols-3">
          {[
            { n: "1", t: "Pegang bow dulu", d: "Bentuk pegangan seperti biasa. Kalau belum bisa, buka teorinya dulu di /bow." },
            { n: "2", t: "Tangan 30-50 cm dari kamera", d: "Arahkan dari SAMPING (sisi jempol menghadap kamera), bukan dari atas." },
            { n: "3", t: "Diam 5 detik", d: "Biar angkanya stabil. Jangan gerak-gerak dulu." },
          ].map((s) => (
            <li key={s.n} className="rounded-xl border border-border-soft bg-surface p-3">
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

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
      <div className="rounded-2xl border border-border-soft bg-surface p-4">
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} playsInline muted className="w-full -scale-x-100" />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
          />
          {status !== "live" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted">
              <span className="text-4xl">🖐️</span>
              {status === "loading" ? "Nyiapin model tangan… (±19 MB, sekali doang)" : "Kamera mati"}
            </div>
          )}
          {status === "live" && (
            <div className="absolute left-3 top-3 rounded-full bg-background/80 px-3 py-1 text-sm font-bold">
              {handSeen ? (
                <span className={reading && reading.score >= 80 ? "text-good" : "text-accent-strong"}>
                  {reading?.score ?? 0}%
                </span>
              ) : (
                <span className="text-muted">
                  {dark ? "🔦 gelap — nyalain lampu" : "nyari tangan…"}
                </span>
              )}
            </div>
          )}
          {status === "live" && drill === "pushup" && (
            <div className="absolute right-3 top-3 rounded-full bg-background/80 px-3 py-1 text-sm font-bold text-accent-strong">
              {reps} reps
            </div>
          )}

          {/* Koreksi utama nempel di video — biar gak perlu scroll ke bawah
              buat tahu yang salah apa dan benernya gimana. */}
          {status === "live" && reading && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/95 to-transparent p-3">
              {worst ? (
                <div className="flex items-start gap-2">
                  <span className="text-xl">⚠️</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-accent-strong">
                      {worst.label} — sekarang {worst.value}
                    </div>
                    <div className="text-xs text-foreground">{worst.fix}</div>
                    <div className="mt-0.5 text-[11px] text-muted">🎯 {worst.target}</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm font-bold text-good">
                  <span className="text-xl">✅</span> Pegangan lu bener — tahan
                  posisi ini
                </div>
              )}
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
            {status === "live" ? "■ Stop kamera" : status === "loading" ? "⏳ Nyiapin…" : "📷 Nyalain kamera"}
          </button>
          <button
            onClick={() => setLeftHanded((v) => !v)}
            className={`rounded-full px-4 py-2 text-sm transition-colors ${
              leftHanded ? "bg-accent/20 text-accent-strong" : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {leftHanded ? "Kidal: bow di tangan kiri" : "Standar: bow di tangan kanan"}
          </button>
          {[
            { v: "cek" as const, label: "🔍 Cek pegangan" },
            { v: "pushup" as const, label: "💪 Bow hold push-up" },
          ].map((m) => (
            <button
              key={m.v}
              onClick={() => {
                setDrill(m.v);
                counterRef.current.reset();
                setReps(0);
              }}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${
                drill === m.v
                  ? "bg-accent/20 text-accent-strong"
                  : "bg-surface-2 text-muted hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {status === "live" && !handSeen && (
          <div className="mt-3 rounded-lg border border-accent/40 bg-accent/10 p-3 text-xs">
            <b className="text-accent-strong">Tangan belum kebaca. Cek ini:</b>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted">
              {dark && (
                <li className="text-foreground">
                  Ruangannya gelap — ini penyebab paling sering. Nyalain lampu
                  atau hadap ke jendela. (App udah otomatis nerangin gambarnya,
                  tapi ada batasnya.)
                </li>
              )}
              <li>
                Dekatkan tangan ke kamera, 30-50 cm. Tangan yang kekecilan di
                frame susah kebaca.
              </li>
              <li>
                Jangan ada yang nutupin jari — badan biola atau bow yang
                melintang bikin sebagian jari ilang.
              </li>
              <li>Latar belakang jangan sewarna kulit (tembok krem/cokelat).</li>
            </ul>
          </div>
        )}

        {status === "live" && drill === "cek" && (
          <p className="mt-3 text-center text-xs text-muted">
            Pegangan bener bertahan: <b className="text-foreground">{holdPct}%</b> dari waktu.
            Target: tahan 80%+ selama 30 detik.
          </p>
        )}
        {status === "live" && drill === "pushup" && (
          <p className="mt-3 text-center text-xs text-muted">
            Luruskan jari pelan sampai bow rebah, terus tarik balik ke pegangan
            normal. Satu bolak-balik = 1 rep. Target 10 rep/hari.
          </p>
        )}
      </div>

      {/* Kolom kanan: contoh yang BENER + daftar cek, sejajar sama video biar
          gak perlu scroll buat mbandingin. */}
      <div className="space-y-3">
        <div className="rounded-2xl border border-border-soft bg-surface p-4">
          <h2 className="text-sm font-semibold text-accent-strong">
            Contoh yang bener
          </h2>
          <CorrectHold />
          <p className="mt-1 text-[11px] text-muted">
            Franco-Belgian. Jempol menekuk di sudut frog, kelingking melengkung
            di ATAS stick, telunjuk nyentuh di tengah ruas kedua.
          </p>
        </div>

        <AnalysisCard analysis={analysis} onClose={() => setAnalysis(null)} />

      {/* Daftar cek */}
      {reading && (
        <ul className="space-y-2">
          {reading.checks.map((c) => (
            <li
              key={c.id}
              className={`rounded-xl border p-3 ${
                c.ok ? "border-good/40 bg-good/10" : "border-accent/40 bg-accent/10"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span>{c.ok ? "✅" : "⚠️"}</span>
                <span className="flex-1">{c.label}</span>
                <span className="font-mono text-xs text-muted">{c.value}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted">🎯 {c.target}</p>
              {!c.ok && (
                <p className="mt-1 rounded-lg bg-background/40 p-2 text-xs">
                  <b className="text-accent-strong">Benerinnya:</b> {c.fix}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      </div>
      </div>

      <div className="space-y-2 rounded-xl border border-border-soft bg-surface p-4 text-xs text-muted">
        <p>
          ⚖️ <b className="text-foreground">Yang GAK bisa dicek kamera:</b>{" "}
          seberapa dalam stick nempel di telunjuk (kameranya gak lihat batang
          bow-nya) dan seberapa kenceng lu megang. Dua itu tetap butuh mata
          guru. Yang dicek di sini bentuk tangannya — dan itu udah nyelesein
          sebagian besar masalah pemula.
        </p>
        <p>
          🔒 Model tangan jalan di perangkat lu. Gambar kamera gak direkam dan
          gak dikirim ke mana pun.
        </p>
        <p>
          🕐 Jangan kelamaan: 5 menit sehari cukup. Kalau tangan mulai pegal,
          berhenti — pegal itu tandanya lu balik ke jepitan.
        </p>
      </div>
    </div>
  );
}

// Analisis akhir: porsi waktu tiap bagian pegangan bener, plus rata-rata
// sudut jempol — angka itu yang paling langsung nunjukin kebiasaan ngunci.
function buildHandAnalysis(
  t: {
    frames: number;
    ok: Record<string, number>;
    labels: Record<string, string>;
    fixes: Record<string, string>;
    thumbSum: number;
    pinkySum: number;
    scoreSum: number;
    startedAt: number;
  },
  reps: number
): Analysis | null {
  const seconds = (performance.now() - t.startedAt) / 1000;
  if (t.frames < 40 || seconds < 6) return null;

  const rows = Object.keys(t.labels).map((id) => ({
    id,
    label: t.labels[id],
    fix: t.fixes[id],
    pct: Math.round(((t.ok[id] ?? 0) / t.frames) * 100),
  }));
  rows.sort((a, b) => a.pct - b.pct);

  const avgThumb = Math.round(t.thumbSum / t.frames);
  const avgPinky = Math.round(t.pinkySum / t.frames);
  const avg = Math.round(t.scoreSum / t.frames);
  const verdicts = [];

  verdicts.push({
    icon: avgThumb < 165 ? "👍" : "🔒",
    title: `Jempol rata-rata ${avgThumb}°`,
    detail:
      avgThumb < 155
        ? "Jempol lu nekuk dan hidup. Ini fondasi semua kontrol bow."
        : avgThumb < 165
          ? "Nekuk, tapi tipis. Coba tekuk sedikit lagi sampai kuku jempol kelihatan miring."
          : "Jempol lu praktis lurus sepanjang sesi — ini yang bikin bunyi kasar dan tangan cepat pegal. Kerjain bow hold push-up 10 rep/hari sebelum latihan lain.",
    tone: (avgThumb < 155 ? "good" : avgThumb < 165 ? "warn" : "bad") as
      | "good"
      | "warn"
      | "bad",
  });

  verdicts.push({
    icon: avgPinky < 168 ? "🤙" : "🪂",
    title: `Kelingking rata-rata ${avgPinky}°`,
    detail:
      avgPinky < 168
        ? "Melengkung — berat bow di pangkal masih bisa lu imbangi."
        : "Kelingking cenderung lurus. Latihan 'rocket': tegakin bow, tahan cuma pakai jempol + kelingking, 20 detik.",
    tone: (avgPinky < 168 ? "good" : "warn") as "good" | "warn",
  });

  const worst = rows[0];
  if (worst && worst.pct < 70) {
    verdicts.push({
      icon: "🎯",
      title: `Paling sering lepas: ${worst.label} (bener ${worst.pct}% waktu)`,
      detail: worst.fix,
      tone: (worst.pct < 40 ? "bad" : "warn") as "bad" | "warn",
    });
  }

  const solid = rows.filter((r) => r.pct >= 85).map((r) => r.label);
  if (solid.length) {
    verdicts.push({
      icon: "✅",
      title: `Konsisten bener: ${solid.join(", ")}`,
      detail: "Jangan diubah. Fokus energi lu ke yang persentasenya kecil.",
      tone: "good" as const,
    });
  }

  if (reps > 0) {
    verdicts.push({
      icon: "💪",
      title: `${reps} rep bow hold push-up`,
      detail:
        reps >= 10
          ? "Target harian kelar. Ini latihan yang paling cepat ngilangin jempol kaku."
          : `Target 10 rep. Kurang ${10 - reps} lagi.`,
      tone: (reps >= 10 ? "good" : "warn") as "good" | "warn",
    });
  }

  return {
    score: avg,
    headline: "Analisis pegangan bow",
    subline: `${Math.round(seconds)} detik terpantau · rata-rata ${avg}% cek lolos`,
    verdicts,
  };
}

// Contoh pegangan yang bener, digambar di sebelah video biar bisa langsung
// dibandingin sama tangan sendiri tanpa scroll.
function CorrectHold() {
  const spots = [
    { x: 0.28, y: 0.3, t: "telunjuk", note: "tengah ruas ke-2" },
    { x: 0.42, y: 0.26, t: "tengah", note: "" },
    { x: 0.55, y: 0.28, t: "manis", note: "" },
    { x: 0.68, y: 0.22, t: "kelingking", note: "MELENGKUNG di atas" },
    { x: 0.42, y: 0.72, t: "jempol", note: "MENEKUK di sudut frog" },
  ];
  return (
    <svg viewBox="0 0 420 250" className="mt-2 w-full">
      <path
        d="M30 140 Q 210 130 400 122"
        stroke="var(--accent-strong)"
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="120" y="136" width="100" height="44" rx="9" fill="var(--muted)" />
      <rect x="220" y="132" width="50" height="22" rx="6" fill="var(--border)" />
      <line x1="34" y1="158" x2="400" y2="136" stroke="var(--foreground)" strokeWidth="3" opacity="0.55" />
      {spots.map((s) => {
        const cx = 70 + s.x * 280;
        const cy = 50 + s.y * 160;
        const key = s.t === "jempol" || s.t === "kelingking";
        return (
          <g key={s.t}>
            <circle
              cx={cx}
              cy={cy}
              r={key ? 17 : 13}
              fill={key ? "var(--good)" : "var(--surface-2)"}
              stroke={key ? "var(--good)" : "var(--border)"}
              strokeWidth="2"
            />
            <text
              x={cx}
              y={cy + 4}
              fontSize="10"
              fontWeight="bold"
              fill={key ? "var(--background)" : "var(--foreground)"}
              textAnchor="middle"
            >
              {s.t.slice(0, 2)}
            </text>
            {s.note && (
              <text
                x={cx}
                y={cy - 24}
                fontSize="10"
                fill="var(--good)"
                textAnchor="middle"
              >
                {s.note}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

interface HandResult {
  landmarks?: HandPoint[][];
  handedness?: { categoryName?: string; score?: number }[][];
  handednesses?: { categoryName?: string; score?: number }[][];
}

// Pas main biola, tangan kiri (megang leher biola) hampir selalu ikut masuk
// frame. Yang mau dinilai TANGAN BOW. MediaPipe ngasih label kiri/kanan dari
// sudut pandang gambar mentah (belum dicerminin), jadi labelnya bisa langsung
// dipakai. Kalau labelnya gak ada, jatuh ke aturan posisi: tangan bow ada di
// sisi berlawanan dari biola.
function pickBowHand(res: HandResult, leftHanded: boolean): HandPoint[] | null {
  const hands = res.landmarks ?? [];
  if (hands.length === 0) return null;
  if (hands.length === 1) return hands[0];

  const labels = res.handedness ?? res.handednesses ?? [];
  const want = leftHanded ? "Left" : "Right";
  for (let i = 0; i < hands.length; i++) {
    if (labels[i]?.[0]?.categoryName === want) return hands[i];
  }

  // Cadangan: pemain standar megang bow di kanan badan → di gambar mentah
  // (belum dicerminin) tangan itu ada di sisi kiri frame.
  const centerX = (h: HandPoint[]) =>
    h.reduce((s, p) => s + p.x, 0) / h.length;
  const sorted = [...hands].sort((a, b) => centerX(a) - centerX(b));
  return leftHanded ? sorted[sorted.length - 1] : sorted[0];
}

// Naikkan kecerahan sebelum dideteksi. Model tangan gagal di ruangan remang
// walau mata kita jelas lihat tangannya — ini yang bikin "tangan gak
// kelihatan" padahal tangannya jelas ada di layar.
function brighten(
  video: HTMLVideoElement,
  prepRef: React.RefObject<HTMLCanvasElement | null>,
  boostRef: React.RefObject<number>,
  setDark: (v: boolean) => void
): HTMLVideoElement | HTMLCanvasElement {
  if (!video.videoWidth) return video;
  if (!prepRef.current) prepRef.current = document.createElement("canvas");
  const c = prepRef.current;
  const w = 480;
  const h = Math.round((video.videoHeight / video.videoWidth) * w);
  if (c.width !== w) {
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return video;

  // Ukur terang rata-rata sesekali, terus setel penguatnya.
  ctx.filter = "none";
  ctx.drawImage(video, 0, 0, w, h);
  const sample = ctx.getImageData(0, 0, w, h);
  let sum = 0;
  // ambil tiap piksel ke-40 aja — cukup buat rata-rata, murah buat tiap frame
  for (let i = 0; i < sample.data.length; i += 160) {
    sum += sample.data[i] * 0.299 + sample.data[i + 1] * 0.587 + sample.data[i + 2] * 0.114;
  }
  const avg = sum / (sample.data.length / 160);
  const target = 118;
  const wanted = Math.max(1, Math.min(2.8, target / Math.max(12, avg)));
  // dihaluskan biar gak kedap-kedip
  boostRef.current = boostRef.current + (wanted - boostRef.current) * 0.2;
  setDark(avg < 70);

  ctx.filter = `brightness(${boostRef.current.toFixed(2)}) contrast(1.18) saturate(1.1)`;
  ctx.drawImage(video, 0, 0, w, h);
  ctx.filter = "none";
  return c;
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  hand: HandPoint[],
  w: number,
  h: number,
  good: boolean
) {
  const color = good ? "rgba(74,222,128,0.9)" : "rgba(245,185,80,0.9)";
  ctx.lineWidth = Math.max(2, w / 320);
  ctx.strokeStyle = color;
  for (const [a, b] of HAND_BONES) {
    const pa = hand[a];
    const pb = hand[b];
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * w, pa.y * h);
    ctx.lineTo(pb.x * w, pb.y * h);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  for (const p of hand) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, Math.max(2.5, w / 260), 0, Math.PI * 2);
    ctx.fill();
  }
}
