"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePitch } from "@/lib/usePitch";
import { useSensitivity } from "@/lib/micSettings";
import { midiToFreq, midiToName } from "@/lib/notes";
import { playTone } from "@/lib/tone";
import { updateProgress } from "@/lib/progress";
import {
  SONGS,
  deleteCustomSong,
  fingerHint,
  loadCustomSongs,
  type Song,
} from "@/lib/songs";
import BowFeedback from "@/components/BowFeedback";
import SessionEval from "@/components/SessionEval";
import Confetti from "@/components/Confetti";
import LabelSwitch from "@/components/LabelSwitch";
import { labelFor, useLabelMode } from "@/lib/noteLabel";
import { useSessionEval } from "@/lib/sessionEval";

// Mode Lagu: ikutin deretan nada pakai biola beneran.
// Mekanik ala karaoke/Yousician: nada BENER + ditahan = maju.
// Mblero = berhenti, gak maju-maju sampai nadanya bener.

const TOLERANCE = 20; // cent
const HOLD_MS = 600; // nada bener harus ditahan segini
const WRONG_CENTS = 60; // lebih meleset dari ini = jelas salah nada
const WRONG_MS = 800; // salah nada selama ini = kehitung mblero

export default function LaguPage() {
  const sensitivity = useSensitivity();
  const {
    freq,
    volumeDb,
    peak,
    active,
    error,
    noisy,
    calibrating,
    noiseFloorDb,
    reason,
    start,
    stop,
  } = usePitch({ sensitivity });
  const { report, clear } = useSessionEval({
    active,
    freq,
    volumeDb,
    peak,
    reason,
  });
  const [songIdx, setSongIdx] = useState(0);
  const labelMode = useLabelMode();
  // Lagu hasil transkrip sendiri ikut nimbrung di daftar, tapi ditandai —
  // hasil dengar-sendiri bisa meleset, jangan sampai dikira materi resmi.
  const [customSongs, setCustomSongs] = useState<Song[]>([]);
  useEffect(() => setCustomSongs(loadCustomSongs()), []);
  const allSongs = [...SONGS, ...customSongs];
  const [noteIdx, setNoteIdx] = useState(0);
  const [misses, setMisses] = useState(0);
  const [finished, setFinished] = useState(false);
  const [holdPct, setHoldPct] = useState(0);
  const [mblero, setMblero] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const holdStart = useRef<number | null>(null);
  const wrongStart = useRef<number | null>(null);
  const lastHitMidi = useRef<number | null>(null);
  const rearmed = useRef(true); // false = nada berulang nunggu gesekan baru
  const previewTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const song = allSongs[Math.min(songIdx, allSongs.length - 1)] ?? SONGS[0];
  const flat = useMemo(() => song.phrases.flat(), [song]);
  const target = flat[noteIdx];
  const targetFreq = target ? midiToFreq(target.midi) : 0;

  const cents =
    freq !== null && target
      ? Math.round(1200 * Math.log2(freq / targetFreq))
      : null;
  const onTarget = cents !== null && Math.abs(cents) <= TOLERANCE;

  const reset = (nextSongIdx = songIdx) => {
    setSongIdx(nextSongIdx);
    setNoteIdx(0);
    setMisses(0);
    setFinished(false);
    setHoldPct(0);
    setMblero(false);
    holdStart.current = null;
    wrongStart.current = null;
    lastHitMidi.current = null;
    rearmed.current = true;
    previewTimers.current.forEach(clearTimeout);
    // di-mutate, JANGAN di-reassign — cleanup unmount pegang referensi array ini
    previewTimers.current.length = 0;
    setPreviewing(false);
  };

  useEffect(() => {
    if (!active || finished || !target) return;
    const now = performance.now();

    if (onTarget) {
      wrongStart.current = null;
      setMblero(false);
      // Nada sama dengan yang barusan kena wajib digesek ulang (suara sempat
      // putus/meleset dulu) — biar satu gesekan panjang gak dihitung dua nada
      // pada nada berulang kayak A A di Twinkle.
      if (target.midi === lastHitMidi.current && !rearmed.current) {
        holdStart.current = null;
        setHoldPct(0);
        return;
      }
      if (holdStart.current === null) holdStart.current = now;
      const held = now - holdStart.current;
      setHoldPct(Math.min(100, (held / HOLD_MS) * 100));
      if (held >= HOLD_MS) {
        // NADA KENA — lagu maju
        holdStart.current = null;
        lastHitMidi.current = target.midi;
        rearmed.current = false;
        setHoldPct(0);
        if (noteIdx + 1 >= flat.length) {
          setFinished(true);
          const acc = Math.round((flat.length / (flat.length + misses)) * 100);
          updateProgress((p) => {
            const s = p.songs[song.id] ?? { best: 0, plays: 0 };
            s.plays += 1;
            s.best = Math.max(s.best, acc);
            p.songs[song.id] = s;
          });
        } else {
          setNoteIdx((i) => i + 1);
        }
      }
    } else {
      rearmed.current = true; // suara putus/meleset = boleh hitung nada berulang lagi
      holdStart.current = null;
      setHoldPct(0);
      if (cents !== null && Math.abs(cents) > WRONG_CENTS) {
        if (wrongStart.current === null) wrongStart.current = now;
        if (now - wrongStart.current >= WRONG_MS) {
          // MBLERO — satu event salah = satu hitungan. Infinity = "udah
          // dihitung"; balik null (siap hitung lagi) pas nada mendekati
          // bener atau senyap dulu.
          wrongStart.current = Infinity;
          setMblero(true);
          setMisses((m) => m + 1);
        }
      } else {
        wrongStart.current = null;
      }
    }
  }, [freq, onTarget, cents, active, finished, target, noteIdx, flat.length, misses, song.id]);

  const preview = () => {
    if (active || previewing) return;
    setPreviewing(true);
    const beatMs = 550;
    let t = 0;
    flat.forEach((nt) => {
      previewTimers.current.push(
        setTimeout(() => playTone(midiToFreq(nt.midi), (nt.beats * beatMs) / 1000 - 0.05), t)
      );
      t += nt.beats * beatMs;
    });
    previewTimers.current.push(setTimeout(() => setPreviewing(false), t));
  };

  // Bersihin state transien tiap mic berhenti — biar restart gak bawa
  // timestamp basi (nada langsung "kena" / mblero palsu / banner nyangkut).
  useEffect(() => {
    if (!active) {
      holdStart.current = null;
      wrongStart.current = null;
      rearmed.current = true;
      setHoldPct(0);
      setMblero(false);
    }
  }, [active]);

  useEffect(() => {
    // array-nya selalu di-mutate (length = 0), gak pernah di-reassign,
    // jadi referensi yang ke-capture di sini tetap valid sampai unmount
    const timers = previewTimers.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
    };
  }, []);

  const accuracy =
    noteIdx + (finished ? 1 : 0) > 0 || misses > 0
      ? Math.round(
          ((finished ? flat.length : noteIdx) /
            Math.max(1, (finished ? flat.length : noteIdx) + misses)) *
            100
        )
      : null;

  // index global tiap frasa, buat pewarnaan blok
  let runningIdx = 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">🎵 Mode Lagu — Ikutin Nadanya</h1>
        <p className="mt-1 text-sm text-muted">
          Kayak karaoke, tapi buat biola: nada yang nyala kuning itu target lu.
          Gesek bener + tahan sampai lingkarannya penuh = maju. Mblero = lagu
          nunggu, gak maju-maju.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {allSongs.map((s, i) => (
          <button
            key={s.id}
            onClick={() => reset(i)}
            className={`press rounded-full px-3 py-1.5 text-xs ${
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

      {songIdx >= SONGS.length && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent/10 p-3 text-xs">
          <span>
            🎼 Ini lagu hasil transkrip sendiri — bisa ada nada yang meleset.
            Perbaiki dulu di{" "}
            <Link href="/transkrip" className="text-accent-strong underline">
              halaman transkrip
            </Link>{" "}
            kalau ada yang aneh.
          </span>
          <button
            onClick={() => {
              deleteCustomSong(song.id);
              setCustomSongs(loadCustomSongs());
              reset(0);
            }}
            className="press rounded-full bg-surface-2 px-3 py-1 text-muted hover:text-foreground"
          >
            hapus lagu ini
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          {error}
        </div>
      )}

      <div className="relative rounded-2xl border border-border-soft bg-surface p-5">
        <Confetti trigger={finished} />
        <div className="mb-2 flex justify-end">
          <LabelSwitch compact />
        </div>
        <div className="mb-1 flex items-baseline justify-between">
          <div>
            <span className="font-semibold">{song.title}</span>
            <span className="ml-2 text-xs text-muted">
              {song.desc} ({song.level})
            </span>
          </div>
          <span className="text-xs text-muted">
            nada {Math.min(noteIdx + 1, flat.length)}/{flat.length}
          </span>
        </div>

        {/* Papan nada, per frasa satu baris */}
        <div className="mt-3 space-y-2">
          {song.phrases.map((phrase, pi) => (
            <div key={pi} className="flex flex-wrap gap-1.5">
              {phrase.map((nt, ni) => {
                const idx = runningIdx++;
                const state =
                  finished || idx < noteIdx
                    ? "done"
                    : idx === noteIdx
                      ? "current"
                      : "todo";
                return (
                  <div
                    key={ni}
                    className={`flex min-w-14 flex-col items-center rounded-lg border px-2 py-1.5 text-center transition-colors ${
                      state === "done"
                        ? "border-good/40 bg-good/15 text-good"
                        : state === "current"
                          ? "border-accent bg-accent/20 text-accent-strong"
                          : "border-border-soft bg-surface-2 text-muted"
                    } ${nt.beats >= 2 ? "min-w-20" : ""}`}
                  >
                    <span className="text-sm font-bold">
                      {midiToName(nt.midi)}
                    </span>
                    <span className="text-[10px] leading-tight opacity-80">
                      {fingerHint(nt.midi)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Status bar: meteran + hold + mblero */}
        <div className="mt-5 rounded-xl bg-surface-2 p-4 text-center">
          {finished ? (
            <div className="space-y-2">
              <div className="text-3xl font-bold text-good">
                🎉 LAGU SELESAI!
              </div>
              <div className="text-sm text-muted">
                Akurasi: <b className="text-foreground">{accuracy}%</b> —{" "}
                {misses === 0
                  ? "TANPA mblero sekali pun. Gila. 👏"
                  : `${misses}x mblero. Ulangi sampai 0.`}
              </div>
              <button
                onClick={() => reset()}
                className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-background hover:bg-accent-strong"
              >
                🔁 Main lagi
              </button>
            </div>
          ) : (
            <>
              <div className="text-xs uppercase tracking-wide text-muted">
                Target sekarang
              </div>
              <div className="my-1 text-5xl font-bold text-accent-strong">
                {target ? labelFor(target.midi, labelMode) : "—"}
              </div>
              <div className="text-xs text-muted">
                {target ? fingerHint(target.midi) : ""}
              </div>

              {/* meteran cent */}
              <div className="relative mx-auto mt-4 h-3 w-full max-w-sm rounded-full bg-background/60">
                <div className="absolute left-1/2 top-[-5px] h-6 w-0.5 -translate-x-1/2 bg-muted" />
                <div
                  className="absolute top-0 h-3 rounded-full bg-good/25"
                  style={{
                    left: `${50 - (TOLERANCE / 50) * 50}%`,
                    width: `${(TOLERANCE / 50) * 100}%`,
                  }}
                />
                {cents !== null && (
                  <div
                    className={`absolute top-[-7px] h-7 w-1.5 -translate-x-1/2 rounded-full transition-all duration-75 ${
                      onTarget ? "bg-good" : "bg-bad"
                    }`}
                    style={{
                      left: `${50 + (Math.max(-50, Math.min(50, cents)) / 50) * 50}%`,
                    }}
                  />
                )}
              </div>

              {/* progress tahan nada */}
              <div className="mx-auto mt-3 h-2 w-44 overflow-hidden rounded-full bg-background/60">
                <div
                  className="h-full bg-good transition-all duration-100"
                  style={{ width: `${holdPct}%` }}
                />
              </div>

              <div className="mt-2 min-h-6 text-sm">
                {mblero ? (
                  <span className="font-bold text-bad">
                    ❌ MBLERO! Lagu nunggu — benerin dulu nadanya.
                  </span>
                ) : !active ? (
                  <span className="text-muted">Mic belum nyala.</span>
                ) : cents === null ? (
                  <span className="text-muted">Dengerin… gesek nadanya.</span>
                ) : onTarget ? (
                  <span className="font-semibold text-good">TAHAN… 🟢</span>
                ) : cents > 0 ? (
                  <span className="text-muted">+{cents} cent — ketinggian</span>
                ) : (
                  <span className="text-muted">{cents} cent — kerendahan</span>
                )}
              </div>

              {/* Pelatih gesekan: kekecilan / pecah / cempreng */}
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

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={active ? stop : start}
                  className={`rounded-full px-6 py-2.5 font-semibold transition-colors ${
                    active
                      ? "bg-background/60 text-foreground hover:bg-background"
                      : "bg-accent text-background hover:bg-accent-strong"
                  }`}
                >
                  {active ? "■ Stop" : "🎤 Mulai main"}
                </button>
                <button
                  onClick={preview}
                  disabled={active || previewing}
                  className="rounded-full bg-background/60 px-4 py-2.5 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {previewing ? "▶ lagi muter…" : "▶ Dengar lagunya dulu"}
                </button>
                <button
                  onClick={() => {
                    if (!target) return;
                    playTone(targetFreq, 1.2);
                  }}
                  disabled={active}
                  className="rounded-full bg-background/60 px-4 py-2.5 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-50"
                  title="Matiin mic dulu biar gak ke-deteksi"
                >
                  🔔 Nada target
                </button>
              </div>

              <div className="mt-3 text-xs text-muted">
                Mblero sesi ini: <b className="text-bad">{misses}</b>
                {accuracy !== null && (
                  <>
                    {" "}
                    · akurasi sementara:{" "}
                    <b className="text-foreground">{accuracy}%</b>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <SessionEval report={report} onClose={clear} />

      <div className="rounded-xl border border-border-soft bg-surface p-4 text-sm text-muted">
        💡 Tombol &quot;dengar lagunya&quot; dan &quot;nada target&quot; sengaja
        mati pas mic nyala — kalau nggak, mic bakal denger speaker lu dan
        nganggep itu gesekan biola. Dengerin dulu, baru main.
      </div>
    </div>
  );
}
