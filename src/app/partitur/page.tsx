"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePitch } from "@/lib/usePitch";
import { useSensitivity } from "@/lib/micSettings";
import { centsBetween, midiToFreq, midiToName } from "@/lib/notes";
import { playTone } from "@/lib/tone";
import {
  SONGS,
  fingerHint,
  loadCustomSongs,
  type Song,
  type SongNote,
} from "@/lib/songs";
import Staff from "@/components/Staff";
import Confetti from "@/components/Confetti";
import LabelSwitch from "@/components/LabelSwitch";
import { labelFor, labelHint, useLabelMode } from "@/lib/noteLabel";
import BowFeedback from "@/components/BowFeedback";
import SessionEval from "@/components/SessionEval";
import { useSessionEval } from "@/lib/sessionEval";

// Baca partitur sambil main.
//
// Bedanya sama Mode Lagu: di sana nadanya ditulis sebagai nama (A4, B4), jadi
// yang terlatih hafalan huruf. Di sini yang tampil NOT BALOK, dan not yang
// sedang dituju menyala mengikuti permainan. Ini yang dipakai di ujian dan di
// orkestra — dan satu-satunya cara membiasakannya adalah membaca sambil main,
// bukan membaca dulu lalu main.

const TOLERANCE = 25; // cent
const HOLD_MS = 450;

export default function PartiturPage() {
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
  } = usePitch({ sensitivity, stableMs: 150 });
  const { report, clear } = useSessionEval({ active, freq, volumeDb, peak, reason });

  const [songs, setSongs] = useState<Song[]>(SONGS);
  const [songIdx, setSongIdx] = useState(0);
  const [noteIdx, setNoteIdx] = useState(0);
  const [misses, setMisses] = useState(0);
  const [done, setDone] = useState(false);
  const [holdPct, setHoldPct] = useState(0);
  const [showNames, setShowNames] = useState(false);
  const labelMode = useLabelMode();
  const holdStart = useRef<number | null>(null);
  const lastHit = useRef<number | null>(null);
  const rearmed = useRef(true);

  useEffect(() => {
    setSongs([...SONGS, ...loadCustomSongs()]);
  }, []);

  const song = songs[Math.min(songIdx, songs.length - 1)] ?? SONGS[0];
  const flat: SongNote[] = song.phrases.flat();
  const target = flat[noteIdx];
  const targetFreq = target ? midiToFreq(target.midi) : 0;

  const cents =
    freq !== null && target ? Math.round(centsBetween(freq, targetFreq)) : null;
  const onTarget = cents !== null && Math.abs(cents) <= TOLERANCE;

  const reset = useCallback((idx = songIdx) => {
    setSongIdx(idx);
    setNoteIdx(0);
    setMisses(0);
    setDone(false);
    setHoldPct(0);
    holdStart.current = null;
    lastHit.current = null;
    rearmed.current = true;
  }, [songIdx]);

  useEffect(() => {
    if (!active || done || !target) return;
    const now = performance.now();
    if (onTarget) {
      // Nada yang sama dengan yang barusan kena wajib digesek ulang, biar satu
      // gesekan panjang tidak dihitung dua not (mis. A A di Twinkle).
      if (target.midi === lastHit.current && !rearmed.current) {
        holdStart.current = null;
        setHoldPct(0);
        return;
      }
      if (holdStart.current === null) holdStart.current = now;
      const held = now - holdStart.current;
      setHoldPct(Math.min(100, (held / HOLD_MS) * 100));
      if (held >= HOLD_MS) {
        holdStart.current = null;
        lastHit.current = target.midi;
        rearmed.current = false;
        setHoldPct(0);
        if (noteIdx + 1 >= flat.length) setDone(true);
        else setNoteIdx((i) => i + 1);
      }
    } else {
      rearmed.current = true;
      holdStart.current = null;
      setHoldPct(0);
    }
  }, [freq, cents, onTarget, active, done, target, noteIdx, flat.length]);

  const akurasi =
    noteIdx + misses > 0
      ? Math.round((noteIdx / Math.max(1, noteIdx + misses)) * 100)
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">🎼 Baca Partitur Sambil Main</h1>
        <p className="mt-1 text-sm text-muted">
          Not baloknya jalan ngikutin lu. Bedanya sama Mode Lagu: di sana
          nadanya ditulis huruf, jadi yang kelatih hafalan. Di sini lu beneran
          baca — dan itu yang kepakai di ujian dan main bareng orang.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {songs.map((s, i) => (
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
          <div>
            <div className="text-sm font-semibold">{song.title}</div>
            <div className="text-xs text-muted">{song.desc}</div>
          </div>
          <div className="text-xs text-muted">
            not {Math.min(noteIdx + 1, flat.length)}/{flat.length}
            {akurasi !== null && ` · akurasi ${akurasi}%`}
          </div>
        </div>

        <div className="mb-2 flex justify-end">
          <LabelSwitch />
        </div>

        <div className="overflow-x-auto">
          <Staff
            notes={flat}
            current={active && !done ? noteIdx : -1}
            done={noteIdx - 1}
            labels={flat.map((n) => labelFor(n.midi, labelMode))}
          />
        </div>

        {/* Bantuan: nama nada + jari. Dimatikan begitu udah lancar. */}
        {showNames && target && (
          <div className="mt-2 text-center text-sm">
            <b className="text-accent-strong">
              {labelFor(target.midi, labelMode)}
            </b>{" "}
            <span className="text-muted">
              · {labelHint(target.midi, labelMode)}
            </span>
          </div>
        )}

        <div className="mx-auto mt-3 h-2 w-48 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full bg-good transition-all duration-100"
            style={{ width: `${holdPct}%` }}
          />
        </div>

        <div className="mt-2 min-h-6 text-center text-sm">
          {done ? (
            <span className="animate-pop font-bold text-good">
              🎉 Selesai! {misses === 0 ? "Tanpa nyangkut." : `${misses}x meleset.`}
            </span>
          ) : !active ? (
            <span className="text-muted">Mic belum nyala.</span>
          ) : cents === null ? (
            <span className="text-muted">Mainkan not yang nyala…</span>
          ) : onTarget ? (
            <span className="font-bold text-good">TAHAN… 🟢</span>
          ) : (
            <span className="text-accent-strong">
              {cents > 0 ? "ketinggian" : "kerendahan"} {Math.abs(cents)} cent
            </span>
          )}
        </div>

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

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={active ? stop : start}
            className={`press rounded-full px-6 py-2.5 font-semibold ${
              active
                ? "bg-surface-2 text-foreground hover:bg-border-soft"
                : "bg-accent text-background hover:bg-accent-strong"
            }`}
          >
            {active ? "■ Stop" : "🎤 Mulai baca"}
          </button>
          <button
            onClick={() => {
              if (target) playTone(targetFreq, 1);
            }}
            disabled={active}
            className="press rounded-full bg-surface-2 px-4 py-2.5 text-sm text-foreground disabled:opacity-40"
            title="Matiin mic dulu biar speaker gak ke-deteksi"
          >
            🔔 Dengar not ini
          </button>
          <button
            onClick={() => {
              setMisses((m) => m + 1);
              if (noteIdx + 1 >= flat.length) setDone(true);
              else setNoteIdx((i) => i + 1);
            }}
            className="press rounded-full bg-surface-2 px-4 py-2.5 text-sm text-muted hover:text-foreground"
          >
            Lewati →
          </button>
          <button
            onClick={() => reset()}
            className="press rounded-full px-4 py-2.5 text-sm text-muted hover:text-foreground"
          >
            Ulang
          </button>
          <button
            onClick={() => setShowNames((v) => !v)}
            className={`press rounded-full px-4 py-2.5 text-sm ${
              showNames ? "bg-surface-2 text-muted" : "bg-accent/20 text-accent-strong"
            }`}
          >
            {showNames ? "Sembunyikan nama nada" : "Bantuan nama: mati"}
          </button>
        </div>
      </div>

      <SessionEval report={report} onClose={clear} />

      <div className="space-y-2 rounded-xl border border-border-soft bg-surface p-4 text-xs text-muted">
        <p>
          📖 <b className="text-foreground">Cara baca cepat:</b> jangan eja garis
          satu per satu. Lihat ARAH dulu — naik apa turun, jauh apa dekat. Nama
          nadanya nyusul sendiri setelah beberapa hari.
        </p>
        <p>
          🎯 <b className="text-foreground">Matikan bantuan nama</b> begitu bisa
          setengah lagu tanpa nengok. Selama nama nadanya kelihatan, otak lu baca
          tulisan, bukan baca not.
        </p>
        <p>
          🎼 Lagu hasil{" "}
          <Link href="/transkrip" className="text-accent-strong underline">
            transkrip sendiri
          </Link>{" "}
          ikut muncul di daftar atas, jadi lagu apa pun bisa dibaca di sini.
        </p>
      </div>
    </div>
  );
}
