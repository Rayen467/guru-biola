"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePitch } from "@/lib/usePitch";
import { useSensitivity } from "@/lib/micSettings";
import { midiToName } from "@/lib/notes";
import { fingerHint, notesToSong, saveCustomSong } from "@/lib/songs";
import {
  VIOLIN_HIGH,
  VIOLIN_LOW,
  groupFrames,
  guessBpm,
  quantize,
  transcribeBuffer,
  type RawNote,
} from "@/lib/transcribe";
import AnalysisCard, { type Analysis } from "@/components/AnalysisCard";

// Ubah lagu jadi not biola.
//
// Dua sumber: berkas audio milik sendiri, atau suara dari speaker — puter
// lagunya di Spotify/YouTube, app-nya yang dengerin. Sengaja TIDAK menarik
// audio dari layanan itu: Spotify terkunci DRM dan tidak menyediakan audio
// lewat API, dan mengunduh dari YouTube melanggar ketentuannya.

export default function TranskripPage() {
  const sensitivity = useSensitivity();
  const { freq, active, error, start, stop } = usePitch({
    sensitivity,
    stableMs: 120,
  });

  const [mode, setMode] = useState<"berkas" | "dengar">("berkas");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notes, setNotes] = useState<RawNote[]>([]);
  const [bpm, setBpm] = useState(90);
  const [judul, setJudul] = useState("");
  const [pesan, setPesan] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [octave, setOctave] = useState(0);

  const liveRef = useRef<{ t: number; midi: number | null }[]>([]);
  const listenStart = useRef(0);

  // Rekam jejak nada selama mode dengar.
  useEffect(() => {
    if (mode !== "dengar" || !active) return;
    liveRef.current.push({
      t: performance.now() - listenStart.current,
      midi: freq !== null ? 69 + 12 * Math.log2(freq / 440) : null,
    });
  }, [freq, active, mode]);

  const olahBerkas = useCallback(async (file: File) => {
    setBusy(true);
    setPesan(null);
    setNotes([]);
    setProgress(0);
    try {
      const buf = await file.arrayBuffer();
      const ctx = new AudioContext();
      const audio = await ctx.decodeAudioData(buf);
      await ctx.close();
      const hasil = await transcribeBuffer(audio, { onProgress: setProgress });
      setNotes(hasil);
      setBpm(guessBpm(hasil));
      setJudul(file.name.replace(/\.[^.]+$/, ""));
      setAnalysis(buildAnalysis(hasil, audio.duration));
      if (hasil.length === 0) {
        setPesan(
          "Gak ada nada tunggal yang kebaca. Biasanya karena lagunya rame (drum + bass + gitar bareng) — alat ini cuma bisa ngikutin satu nada. Coba bagian solo atau lagu yang lebih sepi."
        );
      }
    } catch (e) {
      setPesan("Gagal baca berkasnya: " + String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const mulaiDengar = async () => {
    liveRef.current = [];
    listenStart.current = performance.now();
    setNotes([]);
    setPesan(null);
    setAnalysis(null);
    await start();
  };

  const selesaiDengar = () => {
    stop();
    // Aturan penggabungannya persis sama dengan jalur berkas — satu fungsi,
    // supaya perbaikan di satu tempat berlaku di dua-duanya.
    const frames = liveRef.current;
    const hasil = groupFrames(frames);

    setNotes(hasil);
    setBpm(guessBpm(hasil));
    setAnalysis(buildAnalysis(hasil, frames.length ? frames[frames.length - 1].t / 1000 : 0));
    if (hasil.length === 0) {
      setPesan(
        "Gak ada nada yang ketangkep. Cek: speakernya kekecilan? mic-nya kejauhan? atau lagunya kebanyakan instrumen bareng."
      );
    }
  };

  const geser = (n: RawNote) => ({ ...n, midi: n.midi + octave * 12 });
  const tampil = notes.map(geser).filter((n) => n.midi >= VIOLIN_LOW && n.midi <= VIOLIN_HIGH);

  const simpan = () => {
    if (tampil.length === 0) return;
    const q = quantize(tampil, bpm);
    const id = "custom-" + Date.now();
    saveCustomSong(
      notesToSong(
        id,
        judul.trim() || "Transkrip tanpa judul",
        q,
        `Hasil transkrip sendiri · ${q.length} not · ${bpm} BPM`
      )
    );
    setPesan("Tersimpan. Buka Mode Lagu — ada di bagian 'Lagu hasil transkrip sendiri'.");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">🎼 Lagu → Not Biola</h1>
        <p className="mt-1 text-sm text-muted">
          Ubah lagu jadi deretan not yang bisa lu latih. Dua cara: muat berkas
          audio punya lu, atau puter lagunya (Spotify, YouTube, apa pun) terus
          biarin app-nya dengerin lewat mic.
        </p>
      </header>

      <div className="flex gap-2">
        {(
          [
            { v: "berkas" as const, label: "📁 Dari berkas audio" },
            { v: "dengar" as const, label: "🎧 Dengerin dari speaker" },
          ]
        ).map((m) => (
          <button
            key={m.v}
            onClick={() => setMode(m.v)}
            className={`press flex-1 rounded-lg px-3 py-2 text-sm ${
              mode === m.v
                ? "bg-accent font-semibold text-background"
                : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-border-soft bg-surface p-5">
        {mode === "berkas" ? (
          <div className="space-y-3 text-center">
            <input
              type="file"
              accept="audio/*"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) olahBerkas(f);
                e.target.value = "";
              }}
              className="mx-auto block text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-background"
            />
            <p className="text-xs text-muted">
              Berkas diproses di perangkat lu — gak diunggah ke mana pun.
            </p>
            {busy && (
              <div className="mx-auto h-2 max-w-sm overflow-hidden rounded-full bg-surface-2">
                <div
                  className="stripes h-full bg-accent transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted">
              Puter lagunya di HP/laptop, dekatkan ke mic, lalu tekan mulai.
              Makin sepi ruangannya makin bagus hasilnya.
            </p>
            <button
              onClick={active ? selesaiDengar : mulaiDengar}
              className={`press rounded-full px-6 py-2.5 font-semibold ${
                active
                  ? "bg-bad text-background"
                  : "bg-accent text-background hover:bg-accent-strong"
              }`}
            >
              {active ? "■ Selesai & ubah jadi not" : "🎧 Mulai dengerin"}
            </button>
            {active && (
              <p className="animate-pop text-xs text-accent-strong">
                Lagi dengerin… {liveRef.current.length} bacaan
              </p>
            )}
          </div>
        )}
      </div>

      {pesan && (
        <p className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
          {pesan}
        </p>
      )}

      <AnalysisCard analysis={analysis} onClose={() => setAnalysis(null)} />

      {/* Hasil */}
      {tampil.length > 0 && (
        <div className="space-y-4 rounded-2xl border border-border-soft bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-accent-strong">
              {tampil.length} not kebaca
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted">Tempo</span>
              <input
                type="number"
                value={bpm}
                min={40}
                max={200}
                onChange={(e) => setBpm(Number(e.target.value) || 90)}
                className="w-16 rounded-lg bg-surface-2 px-2 py-1 text-center"
              />
              <span className="text-muted">BPM</span>
              <button
                onClick={() => setOctave((o) => o - 1)}
                className="press rounded-full bg-surface-2 px-2 py-1"
              >
                oktaf −
              </button>
              <button
                onClick={() => setOctave((o) => o + 1)}
                className="press rounded-full bg-surface-2 px-2 py-1"
              >
                oktaf +
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg bg-surface-2 p-3">
            <div className="flex flex-wrap gap-1.5">
              {tampil.slice(0, 200).map((n, i) => (
                <span
                  key={i}
                  title={`${fingerHint(n.midi)} · ${Math.round(n.durMs)} ms`}
                  className="animate-slide-in rounded-md bg-surface px-2 py-1 text-xs"
                  style={{ animationDelay: `${Math.min(i, 40) * 12}ms` }}
                >
                  {midiToName(n.midi)}
                </span>
              ))}
            </div>
            {tampil.length > 200 && (
              <p className="mt-2 text-[11px] text-muted">
                …{tampil.length - 200} not lagi (semuanya ikut kesimpen)
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder="judul lagu"
              className="flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm"
            />
            <button
              onClick={simpan}
              className="press rounded-full bg-accent px-4 py-2 text-sm font-semibold text-background hover:bg-accent-strong"
            >
              Simpan & latih di Mode Lagu
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-border-soft bg-surface p-4 text-xs text-muted">
        <p>
          ⚖️ <b className="text-foreground">Soal Spotify & YouTube:</b> app ini
          gak narik audio dari sana — Spotify terkunci DRM dan API-nya emang gak
          ngasih audio, sedangkan ngunduh dari YouTube nabrak ketentuan mereka.
          Yang dilakukan di sini: dengerin suara yang keluar dari speaker lu,
          sama kayak orang nyalin lagu pakai telinga.
        </p>
        <p>
          🎯 <b className="text-foreground">Hasil paling bagus:</b> melodi
          tunggal — biola solo, vokal tanpa iringan ramai, piano pelan. Lagu band
          penuh bakal berantakan, karena banyak nada bunyi bareng dan alat ini
          cuma bisa milih satu.
        </p>
        <p>
          🔒 Semua diproses di perangkat lu. Berkas audio gak diunggah, suara mic
          gak direkam ke mana pun.
        </p>
        <p>
          Hasilnya masuk ke{" "}
          <Link href="/lagu" className="text-accent-strong underline">
            Mode Lagu
          </Link>{" "}
          — di sana nadanya baru maju kalau lu mainin dengan bener.
        </p>
      </div>
    </div>
  );
}

function buildAnalysis(notes: RawNote[], durasiDetik: number): Analysis | null {
  if (notes.length === 0) return null;
  const rentang = notes.map((n) => n.midi);
  const lo = Math.min(...rentang);
  const hi = Math.max(...rentang);
  const rapi = notes.filter((n) => Math.abs(n.cents) <= 25).length;
  const yakin = Math.round((rapi / notes.length) * 100);
  const perDetik = durasiDetik > 0 ? notes.length / durasiDetik : 0;

  const verdicts = [
    {
      icon: yakin >= 70 ? "✅" : "⚠️",
      title: `${yakin}% not kebaca meyakinkan`,
      detail:
        yakin >= 70
          ? "Nadanya jelas — hasil transkrip ini layak dipakai latihan."
          : "Banyak nada yang ragu-ragu. Biasanya karena lagunya rame atau suaranya jauh dari mic. Anggap hasilnya draf, bukan partitur.",
      tone: (yakin >= 70 ? "good" : "warn") as "good" | "warn",
    },
    {
      icon: "🎻",
      title: `Rentang ${midiToName(lo)} – ${midiToName(hi)}`,
      detail:
        hi - lo > 24
          ? "Lebarnya lebih dari 2 oktaf — kemungkinan ada nada nyasar dari instrumen lain. Buang manual yang aneh sebelum dilatih."
          : "Masih masuk jangkauan posisi 1–3.",
      tone: (hi - lo > 24 ? "warn" : "good") as "good" | "warn",
    },
    {
      icon: "⏱️",
      title: `${notes.length} not · ${perDetik.toFixed(1)} not per detik`,
      detail:
        perDetik > 6
          ? "Kepadatan segini biasanya tanda banyak nada palsu kepancing dari iringan."
          : "Kepadatan wajar buat melodi.",
      tone: (perDetik > 6 ? "warn" : "good") as "good" | "warn",
    },
  ];

  return {
    score: yakin,
    headline: "Analisis transkrip",
    subline: `${notes.length} not dari ${durasiDetik.toFixed(0)} detik audio`,
    verdicts,
  };
}
