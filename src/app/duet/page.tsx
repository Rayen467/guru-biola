"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePitch } from "@/lib/usePitch";
import { useSensitivity } from "@/lib/micSettings";
import { centsBetween, midiToFreq, midiToName } from "@/lib/notes";
import {
  SONGS,
  fingerHint,
  loadCustomSongs,
  type Song,
  type SongNote,
} from "@/lib/songs";
import {
  Accompanist,
  chordTones,
  planChords,
  type ChordPlan,
} from "@/lib/accompaniment";
import Staff from "@/components/Staff";
import Confetti from "@/components/Confetti";
import BowFeedback from "@/components/BowFeedback";
import AnalysisCard, { type Analysis } from "@/components/AnalysisCard";

// Mode duet: app main iringan, lu main melodinya.
//
// Bedanya sama Mode Lagu dan Partitur: di sana nadanya NUNGGU lu. Di sini
// iringannya jalan terus — kalau ketinggalan, ya ketinggalan. Itu justru
// latihannya: main bareng orang lain berarti tidak ada yang menunggu.
//
// Satu masalah nyata yang diurus di sini: iringan keluar lewat speaker, jadi
// mic ikut mendengarnya. Karena app-lah yang membunyikan iringan itu, dia tahu
// persis nada apa yang sedang berbunyi — nada-nada itu diabaikan dari
// penilaian. Tanpa ini, iringan sendiri bakal kehitung sebagai permainan.

const TOLERANCE = 30; // cent
const ECHO_CENTS = 40; // sedekat ini ke nada iringan = anggap pantulan speaker

export default function DuetPage() {
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
  } = usePitch({ sensitivity, stableMs: 130 });

  const [songs, setSongs] = useState<Song[]>(SONGS);
  const [songIdx, setSongIdx] = useState(1); // Twinkle: lagu duet paling enak
  const [bpm, setBpm] = useState(70);
  const [beatsPerBar] = useState(4);
  const [chordOn, setChordOn] = useState(true);
  const [volume, setVolume] = useState(0.35);
  const [tungguSaya, setTungguSaya] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [noteIdx, setNoteIdx] = useState(0);
  const [bar, setBar] = useState(0);
  const [hits, setHits] = useState(0);
  const [late, setLate] = useState(0);
  const [done, setDone] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const band = useRef(new Accompanist());
  const timer = useRef(0);
  const plan = useRef<ChordPlan[]>([]);
  const startedAt = useRef(0);
  const idxRef = useRef(0);
  const hitRef = useRef(false); // not sekarang udah kena belum
  const devs = useRef<number[]>([]);

  useEffect(() => setSongs([...SONGS, ...loadCustomSongs()]), []);

  const song = songs[Math.min(songIdx, songs.length - 1)] ?? SONGS[0];
  const flat: SongNote[] = song.phrases.flat();
  const target = flat[noteIdx];

  // Nada iringan yang sedang berbunyi — dipakai buat menyaring pantulan speaker.
  const barRoot = plan.current[Math.min(bar, plan.current.length - 1)]?.root;
  const tonesNow = barRoot !== undefined ? chordTones(barRoot) : [];

  const isEcho =
    freq !== null &&
    tonesNow.some((m) => Math.abs(centsBetween(freq, midiToFreq(m))) < ECHO_CENTS) &&
    // kalau nada melodinya sendiri kebetulan sama, jangan dibuang
    (!target || tonesNow.every((m) => m % 12 !== target.midi % 12));

  const cents =
    freq !== null && target && !isEcho
      ? Math.round(centsBetween(freq, midiToFreq(target.midi)))
      : null;
  const onTarget = cents !== null && Math.abs(cents) <= TOLERANCE;

  // Nada yang bener dicatat; iringan tetap jalan sendiri.
  useEffect(() => {
    if (!playing || !active || done || hitRef.current) return;
    if (onTarget) {
      hitRef.current = true;
      setHits((h) => h + 1);
      devs.current.push(performance.now());
    }
  }, [onTarget, playing, active, done]);

  const stopAll = useCallback(
    (buatLaporan = true) => {
      window.clearInterval(timer.current);
      timer.current = 0;
      band.current.stop();
      setPlaying(false);
      stop();
      if (buatLaporan) {
        setAnalysis(
          buildAnalysis(hits, late, flat.length, (performance.now() - startedAt.current) / 1000, bpm)
        );
      }
    },
    [stop, hits, late, flat.length, bpm]
  );

  const mulai = async () => {
    if (!(await start())) return;
    setNoteIdx(0);
    setBar(0);
    setHits(0);
    setLate(0);
    setDone(false);
    setAnalysis(null);
    idxRef.current = 0;
    hitRef.current = false;
    devs.current = [];
    plan.current = planChords(flat, beatsPerBar);
    startedAt.current = performance.now();

    band.current.start(volume);
    setPlaying(true);

    // Satu langkah = satu not melodi. Panjang langkah ikut panjang notnya,
    // jadi lagu dengan not setengah tetap terasa benar.
    const step = () => {
      const i = idxRef.current;
      const n = flat[i];
      if (!n) {
        setDone(true);
        stopAll();
        return;
      }
      const t = band.current.now();
      const barNow = Math.floor(
        flat.slice(0, i).reduce((s, x) => s + x.beats, 0) / beatsPerBar
      );
      setBar(barNow);

      // Bas tiap not; akor dipetik tipis di awal bar.
      const root = plan.current[Math.min(barNow, plan.current.length - 1)]?.root;
      if (root !== undefined) {
        band.current.pluck(root, t, 0.5, 0.55);
        if (chordOn && i % beatsPerBar === 0) {
          chordTones(root)
            .slice(1, 4)
            .forEach((m, k) => band.current.pluck(m, t + 0.04 * k, 0.7, 0.22));
        }
      }

      // Not sebelumnya gak kena = ketinggalan.
      if (i > 0 && !hitRef.current) setLate((l) => l + 1);
      hitRef.current = false;

      setNoteIdx(i);
      idxRef.current = i + 1;

      const durMs = (60000 / bpm) * n.beats;
      timer.current = window.setTimeout(step, durMs);
    };
    step();
  };

  useEffect(() => () => stopAll(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const akurasi = hits + late > 0 ? Math.round((hits / (hits + late)) * 100) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">🎻🎹 Mode Duet</h1>
        <p className="mt-1 text-sm text-muted">
          App main iringan, lu main melodinya. Bedanya sama Mode Lagu: di sini
          iringannya <b>gak nungguin lu</b> — ketinggalan ya ketinggalan. Itu
          justru latihannya, karena main bareng orang juga gak ada yang nungguin.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {songs.map((s, i) => (
          <button
            key={s.id}
            onClick={() => {
              if (playing) return;
              setSongIdx(i);
              setNoteIdx(0);
            }}
            disabled={playing}
            className={`press rounded-full px-3 py-1.5 text-xs disabled:opacity-50 ${
              i === songIdx
                ? "bg-accent font-semibold text-background"
                : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {i >= SONGS.length && "🎼 "}
            {s.title}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          {error}
        </div>
      )}

      <div
        className={`relative rounded-2xl border bg-surface p-4 transition-colors ${
          done ? "border-good animate-glow-good" : "border-border-soft"
        }`}
      >
        <Confetti trigger={done} />

        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm font-semibold">{song.title}</div>
          <div className="text-xs text-muted">
            not {Math.min(noteIdx + 1, flat.length)}/{flat.length}
            {akurasi !== null && ` · kena ${akurasi}%`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Staff notes={flat} current={playing ? noteIdx : -1} done={noteIdx - 1} />
        </div>

        {/* Denyut bar iringan */}
        <div className="mt-3 flex items-center justify-center gap-2">
          {Array.from({ length: beatsPerBar }).map((_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full transition-all duration-100 ${
                playing && noteIdx % beatsPerBar === i
                  ? "scale-125 bg-accent-strong"
                  : "bg-surface-2"
              }`}
            />
          ))}
        </div>

        <div className="mt-2 min-h-8 text-center text-sm">
          {done ? (
            <span className="animate-pop font-bold text-good">
              🎉 Selesai! {hits} kena, {late} ketinggalan.
            </span>
          ) : !playing ? (
            <span className="text-muted">Belum mulai.</span>
          ) : isEcho ? (
            <span className="text-muted">🎹 (itu suara iringan — diabaikan)</span>
          ) : target ? (
            <span>
              <b className="text-accent-strong">{midiToName(target.midi)}</b>{" "}
              <span className="text-muted">· {fingerHint(target.midi)}</span>
              {onTarget && <b className="ml-2 text-good">KENA ✓</b>}
            </span>
          ) : null}
        </div>

        <div className="mt-2">
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

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={playing ? () => stopAll() : mulai}
            className={`press rounded-full px-6 py-2.5 font-semibold ${
              playing
                ? "bg-surface-2 text-foreground hover:bg-border-soft"
                : "bg-accent text-background hover:bg-accent-strong"
            }`}
          >
            {playing ? "■ Stop" : "▶ Mulai duet"}
          </button>
        </div>
      </div>

      {/* Setelan iringan */}
      <div className="space-y-3 rounded-xl border border-border-soft bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium">Tempo: {bpm} BPM</span>
          <input
            type="range"
            min={40}
            max={140}
            value={bpm}
            disabled={playing}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-48 accent-[var(--accent)] disabled:opacity-40"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium">Volume iringan</span>
          <input
            type="range"
            min={0}
            max={70}
            value={Math.round(volume * 100)}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              setVolume(v);
              band.current.setVolume(v);
            }}
            className="w-48 accent-[var(--accent)]"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Akor</div>
            <div className="max-w-sm text-xs text-muted">
              Akornya ditebak dari melodinya sendiri — kasar tapi biasanya pas
              buat lagu latihan. Kalau kedengeran aneh, matiin, sisa bas aja.
            </div>
          </div>
          <button
            onClick={() => setChordOn((v) => !v)}
            className={`press rounded-full px-4 py-1.5 text-xs ${
              chordOn
                ? "bg-accent font-semibold text-background"
                : "bg-surface-2 text-muted"
            }`}
          >
            {chordOn ? "nyala" : "cuma bas"}
          </button>
        </div>
      </div>

      <AnalysisCard analysis={analysis} onClose={() => setAnalysis(null)} />

      <div className="space-y-2 rounded-xl border border-border-soft bg-surface p-4 text-xs text-muted">
        <p>
          🎧 <b className="text-foreground">Pakai headphone kalau ada.</b> Kalau
          lewat speaker tetap bisa: app tahu persis nada apa yang dia bunyiin,
          jadi nada-nada itu diabaikan dari penilaian. Tapi headphone bikin
          deteksi biola lu lebih gesit.
        </p>
        <p>
          🐢 <b className="text-foreground">Mulai dari 60 BPM.</b> Kalau
          ketinggalan terus, turunin — bukan lu yang lambat, tempo-nya yang belum
          waktunya. Latihan nadanya dulu di{" "}
          <Link href="/partitur" className="text-accent-strong underline">
            Partitur
          </Link>{" "}
          (di sana nadanya nungguin lu), baru balik ke sini.
        </p>
      </div>
    </div>
  );
}

function buildAnalysis(
  hits: number,
  late: number,
  total: number,
  seconds: number,
  bpm: number
): Analysis | null {
  if (hits + late < 4) return null;
  const acc = Math.round((hits / Math.max(1, hits + late)) * 100);
  const verdicts = [
    {
      icon: acc >= 80 ? "🎯" : acc >= 50 ? "📈" : "🐢",
      title: `${hits} kena dari ${hits + late} not (${acc}%)`,
      detail:
        acc >= 80
          ? "Lu udah bisa nempel sama iringan. Naikin tempo 10 BPM."
          : acc >= 50
            ? "Setengah nempel. Turunin 10 BPM dulu sampai 80%, baru naik lagi — itu cara naik tempo yang bener."
            : "Ketinggalan kebanyakan. Tempo-nya masih ketinggian; turunin 20 BPM, atau latih nadanya dulu di Partitur yang nungguin lu.",
      tone: (acc >= 80 ? "good" : acc >= 50 ? "warn" : "bad") as
        | "good"
        | "warn"
        | "bad",
    },
    {
      icon: "⏱️",
      title: `${Math.round(seconds)} detik di ${bpm} BPM`,
      detail:
        total > hits + late
          ? "Sesi berhenti sebelum lagunya habis. Gak masalah — potong lagunya jadi 4 bar, kuasai, baru sambung."
          : "Satu lagu penuh tanpa berhenti. Itu latihan mental juga, bukan cuma teknik.",
      tone: "good" as const,
    },
  ];
  return {
    score: acc,
    headline: "Analisis duet",
    subline: `Iringan jalan terus — angka ini ngukur seberapa lu nempel, bukan cuma nada bener`,
    verdicts,
  };
}
