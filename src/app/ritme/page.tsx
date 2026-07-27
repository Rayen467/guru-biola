"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePitch } from "@/lib/usePitch";
import { useMetronome, type MetronomeSettings } from "@/lib/metronome";
import { updateProgress } from "@/lib/progress";
import BowFeedback from "@/components/BowFeedback";

// Latihan ritme: metronom jalan, lu gesek satu nada tiap ketukan, app ngukur
// selisih waktunya dalam milidetik. Intonasi bagus tapi ritme goyang tetap
// kedengeran berantakan — ini alat buat ngelatih sisi itu.

const PERFECT_MS = 35; // di bawah ini praktis gak kedengeran meleset
const OK_MS = 70; // masih dianggap "kena"
const COUNT_IN_BARS = 1; // bar pertama = hitungan masuk, gak dinilai

interface Hit {
  devMs: number; // negatif = kecepetan, positif = kelambatan
  beat: number;
}

export default function RitmePage() {
  const [bpm, setBpm] = useState(60);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [targetBars, setTargetBars] = useState(8);
  const [muteClick, setMuteClick] = useState(false);

  const settings: MetronomeSettings = {
    bpm,
    beatsPerBar,
    subdivision: 1,
    accentFirst: true,
    volume: muteClick ? 0 : 0.7,
    silentEvery: 0,
    rampEvery: 0,
    rampBy: 0,
    rampMax: bpm,
  };

  const metro = useMetronome(settings);
  const { onsetAt, volumeDb, peak, freq, active, error, start, stop } =
    usePitch();

  const [hits, setHits] = useState<Hit[]>([]);
  const [last, setLast] = useState<Hit | null>(null);
  const [done, setDone] = useState(false);

  const beatRef = useRef({ at: 0, interval: 1000, bar: 0, beat: 0 });
  const processedRef = useRef(0);
  const savedRef = useRef(false);

  const running = metro.running && active;
  const scoring = running && metro.pos.bar >= COUNT_IN_BARS && !done;

  // Titik acuan ketukan selalu diperbarui dari metronom (jam audio), jadi
  // pengukuran gak ngelantur walau tempo diganti di tengah jalan.
  useEffect(() => {
    if (metro.pos.at > 0) {
      beatRef.current = {
        at: metro.pos.at,
        interval: 60000 / metro.pos.bpm,
        bar: metro.pos.bar,
        beat: metro.pos.beat,
      };
    }
  }, [metro.pos]);

  const finish = useCallback(() => {
    setDone(true);
    metro.stop();
    stop();
  }, [metro, stop]);

  // Tiap gesekan baru: hitung selisihnya ke ketukan TERDEKAT (bisa ketukan
  // barusan atau ketukan berikutnya — makanya dilipat ke ±setengah ketuk).
  useEffect(() => {
    if (!scoring || onsetAt === 0 || onsetAt === processedRef.current) return;
    processedRef.current = onsetAt;
    const { at, interval, beat } = beatRef.current;
    if (at === 0) return;
    let dev = onsetAt - at;
    dev -= Math.round(dev / interval) * interval;
    const hit: Hit = { devMs: Math.round(dev), beat };
    setLast(hit);
    setHits((h) => [...h, hit]);
  }, [onsetAt, scoring]);

  // Berhenti otomatis kalau jatah barnya habis.
  useEffect(() => {
    if (!running || done) return;
    if (metro.pos.bar >= COUNT_IN_BARS + targetBars) finish();
  }, [metro.pos.bar, running, done, targetBars, finish]);

  const count = hits.length;
  const avgAbs = count
    ? Math.round(hits.reduce((s, h) => s + Math.abs(h.devMs), 0) / count)
    : 0;
  const meanSigned = count
    ? Math.round(hits.reduce((s, h) => s + h.devMs, 0) / count)
    : 0;
  const perfect = hits.filter((h) => Math.abs(h.devMs) <= PERFECT_MS).length;
  const okCount = hits.filter((h) => Math.abs(h.devMs) <= OK_MS).length;

  // Simpan sekali per sesi, pas sesi beneran selesai dan ada datanya.
  useEffect(() => {
    if (!done || savedRef.current || count === 0) return;
    savedRef.current = true;
    updateProgress((p) => {
      p.rhythm.rounds += 1;
      p.rhythm.lastAvgMs = avgAbs;
      p.rhythm.bestAvgMs =
        p.rhythm.bestAvgMs === null
          ? avgAbs
          : Math.min(p.rhythm.bestAvgMs, avgAbs);
    });
  }, [done, count, avgAbs]);

  const begin = async () => {
    setHits([]);
    setLast(null);
    setDone(false);
    processedRef.current = 0;
    savedRef.current = false;
    beatRef.current = { at: 0, interval: 60000 / bpm, bar: 0, beat: 0 };
    // metronom baru jalan kalau mic-nya beneran nyala — kalau izin ditolak,
    // jangan tinggalin klik metronom bunyi tanpa ada yang ngukur
    if (await start()) metro.start();
  };

  const halt = () => {
    metro.stop();
    stop();
    setDone(count > 0);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">⏱️ Latihan Ritme</h1>
        <p className="mt-1 text-sm text-muted">
          Gesek satu nada (senar kosong aja boleh) tepat di tiap ketukan. App
          ngukur lu meleset berapa milidetik — kecepetan atau kelambatan.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          {error}
        </div>
      )}

      {/* Setelan */}
      <div className="space-y-3 rounded-xl border border-border-soft bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium">Tempo: {bpm} BPM</div>
          <input
            type="range"
            min={40}
            max={140}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            disabled={running}
            className="w-48 accent-[var(--accent)] disabled:opacity-40"
            aria-label="Tempo"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium">Birama</div>
          <div className="flex gap-2">
            {[2, 3, 4].map((b) => (
              <button
                key={b}
                onClick={() => setBeatsPerBar(b)}
                disabled={running}
                className={`rounded-full px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                  beatsPerBar === b
                    ? "bg-accent font-semibold text-background"
                    : "bg-surface-2 text-muted hover:text-foreground"
                }`}
              >
                {b}/4
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium">Panjang sesi</div>
          <div className="flex gap-2">
            {[4, 8, 16].map((n) => (
              <button
                key={n}
                onClick={() => setTargetBars(n)}
                disabled={running}
                className={`rounded-full px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                  targetBars === n
                    ? "bg-accent font-semibold text-background"
                    : "bg-surface-2 text-muted hover:text-foreground"
                }`}
              >
                {n} bar
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Klik metronom</div>
            <div className="max-w-sm text-xs text-muted">
              Tanpa headphone, bunyi klik ikut kedengeran mic dan kehitung
              sebagai gesekan. Pilih bisu — ketukannya ikutin titik yang nyala.
            </div>
          </div>
          <button
            onClick={() => setMuteClick((m) => !m)}
            disabled={running}
            className={`rounded-full px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
              muteClick
                ? "bg-accent font-semibold text-background"
                : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {muteClick ? "🔇 bisu (visual)" : "🔊 bunyi"}
          </button>
        </div>
      </div>

      {/* Papan latihan */}
      <div className="rounded-2xl border border-border-soft bg-surface p-6 text-center">
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: beatsPerBar }).map((_, i) => {
            const on = running && metro.pos.beat === i;
            const accent = i === 0;
            return (
              <div
                key={i}
                className={`rounded-full transition-all duration-75 ${
                  accent ? "h-7 w-7" : "h-5 w-5"
                } ${on ? "scale-125 bg-accent-strong" : "bg-surface-2"}`}
              />
            );
          })}
        </div>

        <div className="mt-3 min-h-6 text-sm text-muted">
          {!running && !done && "Siapin biola, nyalain mic, gesek per ketukan."}
          {running && !scoring && "🎬 Hitungan masuk — belum dinilai…"}
          {scoring &&
            `Bar ${metro.pos.bar - COUNT_IN_BARS + 1} dari ${targetBars}`}
          {done && "Sesi selesai."}
        </div>

        {/* Umpan balik gesekan terakhir */}
        <div className="mt-4 min-h-20">
          {last ? (
            <>
              <div
                className={`text-4xl font-bold ${
                  Math.abs(last.devMs) <= PERFECT_MS
                    ? "text-good"
                    : Math.abs(last.devMs) <= OK_MS
                      ? "text-accent-strong"
                      : "text-bad"
                }`}
              >
                {Math.abs(last.devMs) <= PERFECT_MS
                  ? "🎯 PAS"
                  : last.devMs < 0
                    ? `⏪ KECEPETAN ${Math.abs(last.devMs)} ms`
                    : `⏩ KELAMBATAN ${last.devMs} ms`}
              </div>
              <div className="mt-1 text-xs text-muted">
                {Math.abs(last.devMs) <= PERFECT_MS
                  ? "Segini kupingnya orang gak bakal denger meleset."
                  : last.devMs < 0
                    ? "Bow-nya udah jalan sebelum ketukan. Tunggu klik, baru tarik."
                    : "Bow telat mulai. Siapin bow nempel senar sebelum ketukan."}
              </div>
            </>
          ) : (
            <div className="pt-6 text-sm text-muted">
              {scoring ? "Nunggu gesekan…" : ""}
            </div>
          )}
        </div>

        {/* Sebaran ketepatan: garis tengah = ketukan */}
        <div className="relative mx-auto mt-2 h-10 w-full max-w-md rounded-lg bg-surface-2">
          <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-muted/60" />
          <div className="absolute left-[42%] top-0 h-full w-[16%] rounded bg-good/15" />
          {hits.slice(-40).map((h, i) => {
            const half = 60000 / bpm / 2;
            const x = 50 + (Math.max(-half, Math.min(half, h.devMs)) / half) * 50;
            return (
              <div
                key={`${h.beat}-${i}`}
                className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                  Math.abs(h.devMs) <= PERFECT_MS
                    ? "bg-good"
                    : Math.abs(h.devMs) <= OK_MS
                      ? "bg-accent-strong"
                      : "bg-bad"
                }`}
                style={{ left: `${x}%` }}
              />
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <span>kecepetan</span>
          <span>tepat ketukan</span>
          <span>kelambatan</span>
        </div>

        <div className="mt-4">
          <BowFeedback
            active={active}
            freq={freq}
            volumeDb={volumeDb}
            peak={peak}
          />
        </div>

        <button
          onClick={running ? halt : begin}
          className={`mt-4 rounded-full px-6 py-2.5 font-semibold transition-colors ${
            running
              ? "bg-surface-2 text-foreground hover:bg-border-soft"
              : "bg-accent text-background hover:bg-accent-strong"
          }`}
        >
          {running ? "■ Stop" : "🎤 Mulai latihan"}
        </button>
      </div>

      {/* Hasil */}
      {count > 0 && (
        <div className="space-y-2 rounded-xl border border-border-soft bg-surface p-5">
          <h2 className="text-sm font-semibold text-accent-strong">
            Hasil {done ? "sesi" : "sementara"}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Gesekan" value={String(count)} />
            <Stat label="Rata-rata meleset" value={`${avgAbs} ms`} />
            <Stat
              label="Pas (≤35 ms)"
              value={`${Math.round((perfect / count) * 100)}%`}
            />
            <Stat
              label="Kena (≤70 ms)"
              value={`${Math.round((okCount / count) * 100)}%`}
            />
          </div>
          <p className="text-xs text-muted">
            {Math.abs(meanSigned) <= 10
              ? "Gak ada kecenderungan — timing lu netral, tinggal rapiin sebarannya."
              : meanSigned < 0
                ? `Rata-rata ${Math.abs(meanSigned)} ms KECEPETAN. Kebiasaan paling umum: bow keburu jalan. Tunggu bunyinya dulu.`
                : `Rata-rata ${meanSigned} ms KELAMBATAN. Siapin bow nempel senar sebelum ketukan, jangan mulai dari udara.`}
          </p>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-border-soft bg-surface p-4 text-xs text-muted">
        <p>
          🎧 <b className="text-foreground">Pakai headphone</b> kalau ada. Lewat
          speaker, klik metronom ikut masuk mic dan kehitung sebagai gesekan —
          atau pilih mode bisu di atas.
        </p>
        <p>
          🎻 <b className="text-foreground">Cara latihannya:</b> satu gesekan
          penuh per ketukan, gantian turun-naik. Bow harus udah nempel senar
          sebelum ketukan bunyi — kalau baru turun dari udara, pasti telat.
        </p>
        <p>
          📏 <b className="text-foreground">Ketelitian alat:</b> deteksi awal
          gesekan lewat mic akurat sekitar ±20 ms. Angka di bawah itu jangan
          dianggap mutlak; yang penting arah kecenderungan dan sebarannya.
        </p>
      </div>
    </div>
  );
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
