"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  MAX_BPM,
  MIN_BPM,
  loadSettings,
  saveSettings,
  tempoTerm,
  useMetronome,
  type MetronomeSettings,
} from "@/lib/metronome";
import AnalysisCard, { type Analysis } from "@/components/AnalysisCard";

const BIRAMA = [
  { label: "2/4", beats: 2 },
  { label: "3/4", beats: 3 },
  { label: "4/4", beats: 4 },
  { label: "6/8", beats: 6 },
];

const SUBDIVISI = [
  { label: "Ketuk", value: 1, hint: "1 klik per ketuk" },
  { label: "Duplet", value: 2, hint: "2 klik per ketuk (1/8)" },
  { label: "Triol", value: 3, hint: "3 klik per ketuk" },
  { label: "1/16", value: 4, hint: "4 klik per ketuk" },
];

const TAP_TIMEOUT_MS = 2500; // ketukan lebih lama dari ini = mulai ngitung ulang

export default function MetronomePage() {
  const [settings, setSettings] = useState<MetronomeSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const { running, pos, toggle } = useMetronome(settings);
  // Pas ramp nyala, angka yang bener itu tempo ketukan terakhir yang bunyi;
  // selain itu ikut slider biar responsif waktu digeser.
  const liveBpm =
    running && settings.rampEvery > 0 ? pos.bpm : settings.bpm;
  const taps = useRef<number[]>([]);
  const [tapInfo, setTapInfo] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  // Rekam jalannya sesi metronom biar pas distop ada laporannya, bukan cuma diam.
  const runRef = useRef({ startedAt: 0, bars: 0, minBpm: 0, maxBpm: 0, silent: 0 });

  useEffect(() => {
    setSettings(loadSettings());
    setReady(true);
  }, []);

  // Kumpulin jalannya sesi: berapa bar, tempo terendah/tertinggi, berapa bar hening.
  useEffect(() => {
    if (!running || pos.at === 0) return;
    const r = runRef.current;
    if (r.startedAt === 0) {
      r.startedAt = performance.now();
      r.minBpm = pos.bpm;
      r.maxBpm = pos.bpm;
    }
    r.bars = pos.bar + 1;
    r.minBpm = Math.min(r.minBpm, pos.bpm);
    r.maxBpm = Math.max(r.maxBpm, pos.bpm);
    if (pos.silent && pos.beat === 0) r.silent++;
  }, [pos, running]);

  // Begitu distop, langsung keluar laporannya.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (running) {
      wasRunning.current = true;
      setAnalysis(null);
      return;
    }
    if (wasRunning.current) {
      wasRunning.current = false;
      setAnalysis(buildMetronomeAnalysis(runRef.current, settings));
      runRef.current = { startedAt: 0, bars: 0, minBpm: 0, maxBpm: 0, silent: 0 };
    }
  }, [running, settings]);

  useEffect(() => {
    if (ready) saveSettings(settings);
  }, [settings, ready]);

  const patch = useCallback(
    (p: Partial<MetronomeSettings>) => setSettings((s) => ({ ...s, ...p })),
    []
  );

  const nudgeBpm = useCallback(
    (delta: number) =>
      setSettings((s) => ({
        ...s,
        bpm: Math.min(MAX_BPM, Math.max(MIN_BPM, s.bpm + delta)),
      })),
    []
  );

  const tap = useCallback(() => {
    const now = performance.now();
    const list = taps.current;
    if (list.length && now - list[list.length - 1] > TAP_TIMEOUT_MS) {
      list.length = 0;
    }
    list.push(now);
    if (list.length > 5) list.shift();
    if (list.length < 2) {
      setTapInfo("ketuk lagi…");
      return;
    }
    // rata-rata jarak antar ketukan — lebih stabil daripada ambil jarak terakhir
    const span = list[list.length - 1] - list[0];
    const bpm = Math.round(60000 / (span / (list.length - 1)));
    if (bpm >= MIN_BPM && bpm <= MAX_BPM) {
      patch({ bpm });
      setTapInfo(`${list.length} ketukan → ${bpm} BPM`);
    } else {
      setTapInfo("di luar 30–240 BPM, ketuk ulang");
    }
  }, [patch]);

  // Keyboard: spasi start/stop, panah atas/bawah geser tempo (shift = lompat 5).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        nudgeBpm(e.shiftKey ? 5 : 1);
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        nudgeBpm(e.shiftKey ? -5 : -1);
      } else if (e.code === "KeyT") {
        tap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, nudgeBpm, tap]);

  const ramping = settings.rampEvery > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">🥁 Metronom</h1>
        <p className="mt-1 text-sm text-muted">
          Nada bener tapi tempo goyang = tetap kedengeran amatir. Semua latihan
          gesek dan lagu idealnya jalan bareng metronom, pelan dulu.
        </p>
      </header>

      {/* Tempo */}
      <div className="rounded-2xl border border-border-soft bg-surface p-6 text-center">
        <div className="text-xs uppercase tracking-wide text-muted">
          Tempo {ramping && liveBpm !== settings.bpm && "(lagi dinaikin)"}
        </div>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => nudgeBpm(-1)}
            className="h-10 w-10 rounded-full bg-surface-2 text-xl text-foreground transition-colors hover:bg-border-soft"
            aria-label="Turunkan tempo"
          >
            −
          </button>
          <div>
            <div className="text-6xl font-bold tabular-nums text-accent-strong">
              {liveBpm}
            </div>
            <div className="text-xs text-muted">BPM</div>
          </div>
          <button
            onClick={() => nudgeBpm(1)}
            className="h-10 w-10 rounded-full bg-surface-2 text-xl text-foreground transition-colors hover:bg-border-soft"
            aria-label="Naikkan tempo"
          >
            +
          </button>
        </div>
        <div className="mt-1 text-sm text-muted">{tempoTerm(liveBpm)}</div>

        <input
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          value={settings.bpm}
          onChange={(e) => patch({ bpm: Number(e.target.value) })}
          className="mt-4 w-full accent-[var(--accent)]"
          aria-label="Tempo"
        />

        {/* Titik ketukan */}
        <div className="mt-5 flex items-center justify-center gap-2">
          {Array.from({ length: settings.beatsPerBar }).map((_, i) => {
            const on = running && pos.beat === i;
            const accent = i === 0 && settings.accentFirst;
            return (
              <div
                key={i}
                className={`rounded-full transition-all duration-75 ${
                  accent ? "h-6 w-6" : "h-4 w-4"
                } ${
                  on
                    ? pos.silent
                      ? "bg-muted"
                      : accent
                        ? "bg-accent-strong scale-125"
                        : "bg-good scale-125"
                    : "bg-surface-2"
                }`}
              />
            );
          })}
        </div>
        <div className="mt-2 min-h-5 text-xs text-muted">
          {running
            ? pos.silent
              ? "🤫 BAR HENING — jaga tempo di kepala"
              : `Bar ${pos.bar + 1} · ketuk ${pos.beat + 1}/${settings.beatsPerBar}`
            : "Spasi = start/stop · ↑↓ = geser tempo · T = tap"}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={toggle}
            className={`rounded-full px-8 py-2.5 font-semibold transition-colors ${
              running
                ? "bg-surface-2 text-foreground hover:bg-border-soft"
                : "bg-accent text-background hover:bg-accent-strong"
            }`}
          >
            {running ? "■ Stop" : "▶ Mulai"}
          </button>
          <button
            onClick={tap}
            className="rounded-full bg-surface-2 px-5 py-2.5 text-sm text-foreground transition-colors hover:bg-border-soft"
          >
            👆 Tap tempo
          </button>
        </div>
        {tapInfo && <div className="mt-2 text-xs text-muted">{tapInfo}</div>}
      </div>

      <AnalysisCard analysis={analysis} onClose={() => setAnalysis(null)} />

      {/* Pengaturan dasar */}
      <div className="space-y-4 rounded-xl border border-border-soft bg-surface p-5">
        <Row label="Birama">
          <div className="flex flex-wrap gap-2">
            {BIRAMA.map((b) => (
              <Chip
                key={b.label}
                active={settings.beatsPerBar === b.beats}
                onClick={() => patch({ beatsPerBar: b.beats })}
              >
                {b.label}
              </Chip>
            ))}
          </div>
        </Row>

        <Row
          label="Pecahan ketuk"
          hint={SUBDIVISI.find((s) => s.value === settings.subdivision)?.hint}
        >
          <div className="flex flex-wrap gap-2">
            {SUBDIVISI.map((s) => (
              <Chip
                key={s.value}
                active={settings.subdivision === s.value}
                onClick={() => patch({ subdivision: s.value })}
              >
                {s.label}
              </Chip>
            ))}
          </div>
        </Row>

        <Row label="Aksen ketukan 1">
          <Chip
            active={settings.accentFirst}
            onClick={() => patch({ accentFirst: !settings.accentFirst })}
          >
            {settings.accentFirst ? "nyala" : "mati"}
          </Chip>
        </Row>

        <Row label="Volume">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.volume * 100)}
            onChange={(e) => patch({ volume: Number(e.target.value) / 100 })}
            className="w-40 accent-[var(--accent)]"
            aria-label="Volume metronom"
          />
        </Row>
      </div>

      {/* Mode latihan */}
      <div className="space-y-4 rounded-xl border border-border-soft bg-surface p-5">
        <h2 className="text-sm font-semibold text-accent-strong">
          Mode latihan lanjutan
        </h2>

        <Row
          label="🤫 Bar hening"
          hint="Metronom diem tiap bar ke-N. Kalau pas bunyi lagi lu masih pas, tempo internal lu udah kebentuk."
        >
          <div className="flex flex-wrap gap-2">
            {[0, 2, 4, 8].map((n) => (
              <Chip
                key={n}
                active={settings.silentEvery === n}
                onClick={() => patch({ silentEvery: n })}
              >
                {n === 0 ? "mati" : `tiap ${n} bar`}
              </Chip>
            ))}
          </div>
        </Row>

        <Row
          label="📈 Tempo naik otomatis"
          hint="Cara benar naikin kecepatan: mulai pelan, naik dikit-dikit, berhenti begitu mulai meleset."
        >
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Chip
              active={ramping}
              onClick={() => patch({ rampEvery: ramping ? 0 : 4 })}
            >
              {ramping ? "nyala" : "mati"}
            </Chip>
            {ramping && (
              <>
                <span className="text-muted">tiap</span>
                <NumField
                  value={settings.rampEvery}
                  min={1}
                  max={32}
                  onChange={(v) => patch({ rampEvery: v })}
                />
                <span className="text-muted">bar, +</span>
                <NumField
                  value={settings.rampBy}
                  min={1}
                  max={20}
                  onChange={(v) => patch({ rampBy: v })}
                />
                <span className="text-muted">BPM, stop di</span>
                <NumField
                  value={settings.rampMax}
                  min={MIN_BPM}
                  max={MAX_BPM}
                  onChange={(v) => patch({ rampMax: v })}
                />
              </>
            )}
          </div>
        </Row>
      </div>

      <div className="space-y-2 rounded-xl border border-border-soft bg-surface p-4 text-xs text-muted">
        <p>
          🎻 <b className="text-foreground">Cara pakai buat biola:</b> setel 50–60
          BPM, satu gesekan penuh (bow naik atau turun) per ketuk. Bow harus
          nyampe ujungnya pas klik berikutnya — itu yang bikin panjang gesekan
          rata.
        </p>
        <p>
          🐢 <b className="text-foreground">Aturan emas:</b> kalau meleset,
          turunin 10 BPM — jangan diulang di tempo yang sama. Latihan salah
          berulang = ngapalin yang salah.
        </p>
        <p>
          Sambungin ke{" "}
          <Link href="/intonasi" className="text-accent-strong underline">
            latihan intonasi
          </Link>{" "}
          atau{" "}
          <Link href="/lagu" className="text-accent-strong underline">
            mode lagu
          </Link>{" "}
          — buka metronom di tab lain, biarin jalan, terus latihan di sana.
        </p>
      </div>
    </div>
  );
}

// Metronom gak dengerin lu — jadi yang dilaporin apa yang MEMANG bisa
// diketahui: berapa lama, berapa bar, tempo bergerak ke mana, dan latihan
// mana yang dipakai. Jangan ngarang penilaian permainan dari alat yang budeg.
function buildMetronomeAnalysis(
  r: { startedAt: number; bars: number; minBpm: number; maxBpm: number; silent: number },
  s: MetronomeSettings
): Analysis | null {
  if (r.startedAt === 0 || r.bars < 2) return null;
  const seconds = (performance.now() - r.startedAt) / 1000;
  const beats = r.bars * s.beatsPerBar;
  const verdicts = [];

  verdicts.push({
    icon: "⏱️",
    title: `${Math.round(seconds)} detik · ${r.bars} bar · ${beats} ketukan`,
    detail:
      seconds < 60
        ? "Sesi pendek. Latihan bareng metronom baru kerasa efeknya setelah beberapa menit — badan butuh waktu buat nyetel."
        : "Durasi segini udah cukup buat ngebentuk rasa tempo.",
    tone: (seconds < 60 ? "warn" : "good") as "warn" | "good",
  });

  if (r.maxBpm > r.minBpm) {
    verdicts.push({
      icon: "📈",
      title: `Tempo naik ${r.minBpm} → ${r.maxBpm} BPM`,
      detail:
        r.maxBpm - r.minBpm > 30
          ? "Lompatannya lumayan jauh. Kalau di tempo atas mulai meleset, turunin lagi 10 BPM — latihan salah berulang itu ngapalin yang salah."
          : "Kenaikan bertahap kayak gini yang bener: pelan dulu, naik dikit-dikit.",
      tone: "good" as const,
    });
  } else {
    verdicts.push({
      icon: "🎚️",
      title: `Tempo tetap ${r.minBpm || s.bpm} BPM`,
      detail:
        "Kalau di tempo ini udah kerasa gampang, nyalain 'tempo naik otomatis' — biar naiknya terukur, bukan asal geser.",
      tone: "good" as const,
    });
  }

  if (r.silent > 0) {
    verdicts.push({
      icon: "🤫",
      title: `${r.silent} bar hening dilewati`,
      detail:
        "Bagus — bar hening itu latihan paling jujur buat tempo internal. Kalau pas klik balik lu masih pas, rasa tempo lu udah kebentuk.",
      tone: "good" as const,
    });
  } else {
    verdicts.push({
      icon: "💡",
      title: "Belum coba bar hening",
      detail:
        "Nyalain 'bar hening tiap 4 bar'. Metronom bakal diam sebentar — di situ ketahuan lu ngikutin klik atau udah punya tempo sendiri.",
      tone: "warn" as const,
    });
  }

  verdicts.push({
    icon: "🎻",
    title: "Lanjutannya",
    detail:
      "Metronom cuma ngasih ketukan — dia gak tahu gesekan lu tepat apa nggak. Buat itu, pakai menu Ritme: di sana mic ngukur lu meleset berapa milidetik dari tiap ketukan.",
    tone: "good" as const,
  });

  // Skornya dari kelengkapan latihan, bukan dari permainan (metronom gak dengerin)
  let score = 40;
  if (seconds >= 60) score += 20;
  if (seconds >= 180) score += 10;
  if (r.maxBpm > r.minBpm) score += 15;
  if (r.silent > 0) score += 15;

  return {
    score: Math.min(100, score),
    headline: "Ringkasan sesi metronom",
    subline: `${r.bars} bar di birama ${s.beatsPerBar}/4 · skor ini menilai POLA latihannya, bukan permainan lu`,
    verdicts,
  };
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-32">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 max-w-xs text-xs text-muted">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
        active
          ? "bg-accent font-semibold text-background"
          : "bg-surface-2 text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function NumField({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
      }}
      className="w-16 rounded-lg bg-surface-2 px-2 py-1 text-center text-foreground"
    />
  );
}
