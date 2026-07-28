"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePitch } from "@/lib/usePitch";
import { freqToNote, midiToName } from "@/lib/notes";
import { useSensitivity } from "@/lib/micSettings";
import BowFeedback from "@/components/BowFeedback";
import SessionEval from "@/components/SessionEval";
import { useSessionEval } from "@/lib/sessionEval";

// Rekam & bedah latihan.
//
// Saran paling sering dari guru biola: "rekam dirimu sendiri". Masalahnya,
// pas main, kuping lu sibuk ngurusin jari dan bow — nada fals sering kelewat.
// Di sini rekamannya disimpan BARENG jejak nada per milidetik, jadi bukan cuma
// kedengeran ada yang salah, tapi keliatan persis di detik ke berapa dan
// nadanya meleset ke mana.

const MAX_SECONDS = 180;
const IN_TUNE = 15; // ±cent dianggap pas

interface Sample {
  t: number; // ms sejak rekaman mulai
  freq: number;
  midi: number;
  cents: number; // selisih ke nada terdekat, -50..50
}

export default function RekamPage() {
  const sensitivity = useSensitivity();
  const {
    freq,
    volumeDb,
    peak,
    noisy,
    calibrating,
    noiseFloorDb,
    reason,
    active,
    error,
    start,
    stop,
    getStream,
  } = usePitch({ sensitivity });

  const { report, clear } = useSessionEval({
    active,
    freq,
    volumeDb,
    peak,
    reason,
  });
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [recError, setRecError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const samplesRef = useRef<Sample[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef(0);
  const urlRef = useRef<string | null>(null);

  // Kumpulin jejak nada selama merekam. Sumbernya frame yang sama dengan
  // detektor, jadi yang kecatat cuma nada yang lolos saringan — bukan noise.
  useEffect(() => {
    if (!recording || freq === null) return;
    const t = performance.now() - startedAtRef.current;
    const info = freqToNote(freq);
    samplesRef.current.push({ t, freq, midi: info.midi, cents: info.cents });
  }, [freq, recording]);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      const sec = (performance.now() - startedAtRef.current) / 1000;
      setElapsed(sec);
      if (sec >= MAX_SECONDS) stopRecording();
    }, 200);
    return () => window.clearInterval(id);
    // stopRecording stabil (useCallback tanpa dependensi berubah)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    setSamples([...samplesRef.current]);
    if (rec && rec.state === "recording") {
      // mic-nya baru dimatiin setelah blob kelar dirakit (lihat onstop) —
      // kalau stream-nya dicabut duluan, ekor rekaman bisa kepotong
      rec.stop();
    } else {
      stop();
    }
  }, [stop]);

  const startRecording = useCallback(async () => {
    setRecError(null);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setAudioUrl(null);
    samplesRef.current = [];
    setSamples([]);
    setElapsed(0);

    if (!(await start())) return;
    const stream = getStream();
    if (!stream) {
      setRecError("Mic nyala tapi streamnya gak kebaca.");
      return;
    }
    try {
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setAudioUrl(url);
        stop();
      };
      rec.start();
      recorderRef.current = rec;
      startedAtRef.current = performance.now();
      setRecording(true);
    } catch (e) {
      setRecError("Browser ini gak bisa merekam: " + String(e));
      stop();
    }
  }, [start, stop, getStream]);

  // Playhead ngikutin pemutar audio.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const tick = () => {
      setPlayhead(el.paused ? null : el.currentTime * 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioUrl]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  const duration = samples.length ? samples[samples.length - 1].t : 0;
  const stats = analyse(samples);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">⏺️ Rekam & Bedah</h1>
        <p className="mt-1 text-sm text-muted">
          Rekam latihan lu, terus lihat grafik intonasinya per milidetik. Pas
          main, kuping lu sibuk ngurusin jari — yang fals sering kelewat. Di
          sini keliatan detik ke berapa dan melesetnya ke mana.
        </p>
      </header>

      {(error || recError) && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          {error ?? recError}
        </div>
      )}

      <div className="rounded-2xl border border-border-soft bg-surface p-6 text-center">
        <div className="text-4xl font-bold tabular-nums text-accent-strong">
          {formatTime(recording ? elapsed * 1000 : duration)}
        </div>
        <div className="mt-1 text-xs text-muted">
          {recording
            ? `merekam… (maksimal ${MAX_SECONDS / 60} menit)`
            : samples.length
              ? `${samples.length} bacaan nada tersimpan`
              : "belum ada rekaman"}
        </div>

        {recording && freq !== null && (
          <div className="mt-3 text-2xl font-semibold">
            {freqToNote(freq).name}{" "}
            <span
              className={
                Math.abs(freqToNote(freq).cents) <= IN_TUNE
                  ? "text-good"
                  : "text-accent-strong"
              }
            >
              {freqToNote(freq).cents > 0 ? "+" : ""}
              {freqToNote(freq).cents} cent
            </span>
          </div>
        )}

        {recording && (
          <div className="mt-3">
            <BowFeedback
              active={active}
              freq={freq}
              volumeDb={volumeDb}
              peak={peak}
              noisy={noisy}
              calibrating={calibrating}
              noiseFloorDb={noiseFloorDb}
              reason={reason}
            />
          </div>
        )}

        <button
          onClick={recording ? stopRecording : startRecording}
          className={`mt-5 rounded-full px-6 py-2.5 font-semibold transition-colors ${
            recording
              ? "bg-bad text-background hover:opacity-90"
              : "bg-accent text-background hover:bg-accent-strong"
          }`}
        >
          {recording ? "■ Stop rekam" : "⏺️ Mulai rekam"}
        </button>
      </div>

      <SessionEval report={report} onClose={clear} />

      {/* Grafik intonasi */}
      {samples.length > 0 && (
        <div className="space-y-3 rounded-xl border border-border-soft bg-surface p-5">
          <h2 className="text-sm font-semibold text-accent-strong">
            Garis intonasi — tiap titik = satu bacaan nada
          </h2>
          <IntonationChart
            samples={samples}
            duration={duration}
            playhead={playhead}
            onSeek={(ms) => {
              const el = audioRef.current;
              if (el) {
                el.currentTime = ms / 1000;
                el.play();
              }
            }}
          />
          <div className="flex flex-wrap justify-between gap-2 text-[11px] text-muted">
            <span>🟢 dalam ±{IN_TUNE} cent</span>
            <span>🟡 meleset 15–30 cent</span>
            <span>🔴 meleset &gt; 30 cent</span>
            <span>garis tengah = nada pas</span>
          </div>

          {audioUrl && (
            <div className="space-y-2">
              <audio
                ref={audioRef}
                src={audioUrl}
                controls
                className="w-full"
              />
              <a
                href={audioUrl}
                download={`latihan-biola-${new Date()
                  .toISOString()
                  .slice(0, 16)
                  .replace(/[:T]/g, "-")}.webm`}
                className="inline-block rounded-full bg-surface-2 px-4 py-1.5 text-xs text-foreground hover:bg-border-soft"
              >
                ⬇ Simpan rekaman
              </a>
              <p className="text-[11px] text-muted">
                Klik grafiknya buat lompat ke detik itu. Rekaman cuma ada di
                halaman ini — pindah halaman = hilang, jadi simpan dulu kalau
                mau dibandingin minggu depan.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Hasil bedah */}
      {stats && (
        <div className="space-y-4 rounded-xl border border-border-soft bg-surface p-5">
          <h2 className="text-sm font-semibold text-accent-strong">
            Hasil bedah
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Nada terbaca" value={`${stats.total}`} />
            <Stat
              label={`Pas (±${IN_TUNE} cent)`}
              value={`${stats.inTunePct}%`}
            />
            <Stat label="Meleset rata-rata" value={`${stats.avgAbs} cent`} />
            <Stat
              label="Kecenderungan"
              value={
                Math.abs(stats.bias) <= 3
                  ? "netral"
                  : stats.bias > 0
                    ? `+${stats.bias} tinggi`
                    : `${stats.bias} rendah`
              }
            />
          </div>

          <div>
            <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">
              Nada yang paling sering fals
            </h3>
            {stats.worst.length === 0 ? (
              <p className="text-sm text-muted">
                Gak ada nada yang menonjol melesetnya. Bagus.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {stats.worst.map((w) => (
                  <li
                    key={w.midi}
                    className="flex items-center gap-3 rounded-lg bg-surface-2 p-2.5 text-sm"
                  >
                    <span className="w-14 font-semibold">
                      {midiToName(w.midi)}
                    </span>
                    <span className="flex-1 text-xs text-muted">
                      {w.count} bacaan ·{" "}
                      {w.mean > 0
                        ? "cenderung KETINGGIAN — geser jari mundur (ke arah scroll)"
                        : "cenderung KERENDAHAN — geser jari maju (ke arah jembatan)"}
                    </span>
                    <span
                      className={`font-mono ${
                        Math.abs(w.mean) > 30 ? "text-bad" : "text-accent-strong"
                      }`}
                    >
                      {w.mean > 0 ? "+" : ""}
                      {w.mean}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-muted">
            💡 Cara pakainya: rekam tangga nada pelan-pelan, lihat nada mana yang
            merah, terus latihan nada ITU doang di{" "}
            <a href="/intonasi" className="text-accent-strong underline">
              menu intonasi
            </a>{" "}
            pakai drone. Besoknya rekam lagi — angkanya harus turun.
          </p>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-border-soft bg-surface p-4 text-xs text-muted">
        <p>
          🎯 <b className="text-foreground">Yang enak direkam:</b> tangga nada 1
          oktaf pelan, atau satu frasa lagu yang lagi digarap. 30–60 detik udah
          cukup — rekaman panjang malah bikin males dianalisis.
        </p>
        <p>
          📉 <b className="text-foreground">Baca grafiknya:</b> garis yang
          naik-turun rapat di sekitar tengah = intonasi stabil. Garis yang
          nyangkut di atas/bawah tengah = jari lu konsisten meleset di arah itu
          — itu gampang dibenerin, tinggal geser posisi jari.
        </p>
        <p>
          🔒 Semua diproses di browser lu. Gak ada audio yang dikirim ke mana
          pun.
        </p>
      </div>
    </div>
  );
}

function IntonationChart({
  samples,
  duration,
  playhead,
  onSeek,
}: {
  samples: Sample[];
  duration: number;
  playhead: number | null;
  onSeek: (ms: number) => void;
}) {
  const W = 1000;
  const H = 220;
  const mid = H / 2;
  // ±50 cent dipetakan ke tinggi grafik
  const y = (cents: number) => mid - (cents / 50) * (H / 2 - 10);
  const x = (t: number) => (duration > 0 ? (t / duration) * W : 0);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-56 w-full cursor-pointer rounded-lg bg-surface-2"
      preserveAspectRatio="none"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        onSeek(ratio * duration);
      }}
    >
      {/* pita "pas" */}
      <rect
        x={0}
        y={y(IN_TUNE)}
        width={W}
        height={y(-IN_TUNE) - y(IN_TUNE)}
        fill="var(--good)"
        opacity={0.12}
      />
      <line x1={0} y1={mid} x2={W} y2={mid} stroke="var(--muted)" strokeWidth={1} />
      {[-40, -20, 20, 40].map((c) => (
        <line
          key={c}
          x1={0}
          y1={y(c)}
          x2={W}
          y2={y(c)}
          stroke="var(--border)"
          strokeWidth={0.5}
        />
      ))}

      {samples.map((s, i) => (
        <circle
          key={i}
          cx={x(s.t)}
          cy={y(Math.max(-50, Math.min(50, s.cents)))}
          r={2}
          fill={
            Math.abs(s.cents) <= IN_TUNE
              ? "var(--good)"
              : Math.abs(s.cents) <= 30
                ? "var(--accent)"
                : "var(--bad)"
          }
        />
      ))}

      {playhead !== null && duration > 0 && (
        <line
          x1={x(playhead)}
          y1={0}
          x2={x(playhead)}
          y2={H}
          stroke="var(--accent-strong)"
          strokeWidth={2}
        />
      )}
    </svg>
  );
}

interface Stats {
  total: number;
  inTunePct: number;
  avgAbs: number;
  bias: number;
  worst: { midi: number; count: number; mean: number }[];
}

function analyse(samples: Sample[]): Stats | null {
  if (samples.length === 0) return null;
  const total = samples.length;
  const inTune = samples.filter((s) => Math.abs(s.cents) <= IN_TUNE).length;
  const avgAbs = Math.round(
    samples.reduce((a, s) => a + Math.abs(s.cents), 0) / total
  );
  const bias = Math.round(samples.reduce((a, s) => a + s.cents, 0) / total);

  const byNote = new Map<number, number[]>();
  for (const s of samples) {
    const list = byNote.get(s.midi) ?? [];
    list.push(s.cents);
    byNote.set(s.midi, list);
  }
  const worst = [...byNote.entries()]
    // nada yang cuma nongol sekejap bukan bukti apa-apa
    .filter(([, list]) => list.length >= Math.max(5, total * 0.02))
    .map(([midi, list]) => ({
      midi,
      count: list.length,
      mean: Math.round(list.reduce((a, c) => a + c, 0) / list.length),
    }))
    .filter((n) => Math.abs(n.mean) > IN_TUNE)
    .sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean))
    .slice(0, 5);

  return {
    total,
    inTunePct: Math.round((inTune / total) * 100),
    avgAbs,
    bias,
    worst,
  };
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold text-accent-strong">{value}</div>
    </div>
  );
}
