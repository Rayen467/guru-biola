"use client";

// Latihan geser posisi, dengan pengukuran.
//
// Tuner biasa cuma bilang nada akhirnya benar atau salah. Padahal yang bikin
// geseran kedengeran jelek biasanya bukan nada akhirnya, melainkan bagaimana
// sampai ke sana: kelewat dulu baru balik, atau merosot kelamaan. Dua-duanya
// tidak kelihatan di tuner, dan dua-duanya latihannya beda.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePitch } from "@/lib/usePitch";
import { useSensitivity } from "@/lib/micSettings";
import { useA4 } from "@/lib/notes";
import { labelFor, useLabelMode } from "@/lib/noteLabel";
import LabelSwitch from "@/components/LabelSwitch";
import { useSessionEval } from "@/lib/sessionEval";
import SessionEval from "@/components/SessionEval";
import AnalysisCard, { type Analysis } from "@/components/AnalysisCard";
import { analisaGeseran, WAJAR_GESER, type Cuplik, type HasilGeser } from "@/lib/shift";
import { playTone } from "@/lib/tone";
import { midiToFreq } from "@/lib/notes";
import Fingerboard, { NAMA_SENAR } from "@/components/Fingerboard";

// Nada senar kosong, urut G D A E — dipakai buat mengubah MIDI jadi "semiton
// ke berapa dari nut" yang dimengerti gambar fingerboard.
const SENAR_MIDI = [55, 62, 69, 76];

const JEDA_SELESAI_MS = 300;

interface Latihan {
  id: string;
  senar: string;
  dari: number;
  ke: number;
  posisi: string;
}

// Geseran paling dasar yang diajarkan: posisi 1 ke posisi 3 di tiap senar,
// jari 1 tetap jari 1 — jadi yang dilatih murni jarak tangannya, bukan
// penjariannya.
const LATIHAN: Latihan[] = [
  { id: "a13", senar: "A", dari: 71, ke: 74, posisi: "1 → 3" },
  { id: "a31", senar: "A", dari: 74, ke: 71, posisi: "3 → 1" },
  { id: "d13", senar: "D", dari: 64, ke: 67, posisi: "1 → 3" },
  { id: "d31", senar: "D", dari: 67, ke: 64, posisi: "3 → 1" },
  { id: "e13", senar: "E", dari: 78, ke: 81, posisi: "1 → 3" },
  { id: "g13", senar: "G", dari: 57, ke: 60, posisi: "1 → 3" },
  { id: "a15", senar: "A", dari: 71, ke: 78, posisi: "1 → 5" },
];

function nilai(h: HasilGeser): Analysis {
  if (!h.berhasil) {
    return {
      score: 0,
      headline: "Belum kebaca",
      subline: h.alasan ?? "",
      verdicts: [
        {
          icon: "🎤",
          title: "Coba lagi",
          detail:
            "Gesek nada awalnya dulu sampai bunyinya stabil, baru geser tanpa mengangkat jari, lalu tahan nada tujuannya sebentar.",
          tone: "warn",
        },
      ],
    };
  }

  const verdicts: Analysis["verdicts"] = [];
  let score = 100;

  const meleset = Math.abs(h.simpanganSen);
  if (meleset <= WAJAR_GESER.simpanganSen) {
    verdicts.push({
      icon: "🎯",
      title: `Mendarat tepat (${h.simpanganSen > 0 ? "+" : ""}${h.simpanganSen} sen)`,
      detail: "Tangannya hafal jaraknya. Ini yang paling susah dan udah kepegang.",
      tone: "good",
    });
  } else {
    score -= Math.min(45, meleset);
    verdicts.push({
      icon: h.simpanganSen > 0 ? "⬆️" : "⬇️",
      title: `Mendarat ${meleset} sen ${h.simpanganSen > 0 ? "ketinggian" : "kerendahan"}`,
      detail:
        h.simpanganSen > 0
          ? "Tangannya kejauhan. Coba patokan: ibu jari ikut geser bareng, jangan ketinggalan — kalau ibu jari ketinggalan, jari telunjuk jadi kelewat maju."
          : "Tangannya kurang jauh. Geser dari LENGAN, bukan dengan meregangkan jari — jari yang meregang selalu kurang jauh.",
      tone: meleset > 35 ? "bad" : "warn",
    });
  }

  if (h.kebablasanSen > WAJAR_GESER.kebablasanSen) {
    score -= Math.min(30, h.kebablasanSen);
    verdicts.push({
      icon: "🔁",
      title: `Kelewat ${h.kebablasanSen} sen dulu, baru balik`,
      detail:
        "Ini yang bikin geseran kedengeran 'nyari-nyari'. Latihnya: geser pelan dengan tekanan jari DIRINGANKAN, berhenti tepat sekali, jangan dikoreksi. Lebih baik meleset tapi mantap daripada benar tapi nyari.",
      tone: "bad",
    });
  } else {
    verdicts.push({
      icon: "✅",
      title: "Gak nyari-nyari",
      detail: "Sekali geser langsung berhenti, gak kelewat lalu dikoreksi.",
      tone: "good",
    });
  }

  if (h.lamaGeserMs > WAJAR_GESER.lamaMs) {
    score -= 15;
    verdicts.push({
      icon: "🐢",
      title: `Geserannya ${h.lamaGeserMs} ms — kelamaan`,
      detail:
        "Kalau kelamaan, bunyi merosot di antara dua nadanya kedengeran jelas. Ringankan tekanan jari saat geser, dan percepat perpindahannya — bukan bow-nya.",
      tone: "warn",
    });
  } else {
    verdicts.push({
      icon: "⚡",
      title: `Geserannya ${h.lamaGeserMs} ms — cukup cepat`,
      detail: "Perpindahannya gak kedengeran merosot.",
      tone: "good",
    });
  }

  score = Math.max(5, Math.min(100, Math.round(score)));
  return {
    score,
    headline:
      score >= 85 ? "Geseran bersih" : score >= 60 ? "Lumayan, tinggal dirapiin" : "Masih perlu dilatih pelan",
    subline: `mendarat ${h.simpanganSen > 0 ? "+" : ""}${h.simpanganSen} sen · kelewat ${h.kebablasanSen} sen · ${h.lamaGeserMs} ms`,
    verdicts,
  };
}

export default function GeserPage() {
  const sensitivity = useSensitivity();
  const { freq, volumeDb, peak, active, error, reason, start, stop } = usePitch({
    sensitivity,
    stableMs: 40, // geseran itu nada yang bergerak — jangan disaring terlalu sabar
  });
  const a4 = useA4();
  const labelMode = useLabelMode();
  const { report, clear } = useSessionEval({ active, freq, volumeDb, peak, reason });

  const [latihan, setLatihan] = useState<Latihan>(LATIHAN[0]);
  const [hasil, setHasil] = useState<HasilGeser | null>(null);
  const [riwayat, setRiwayat] = useState<HasilGeser[]>([]);
  const kumpul = useRef<Cuplik[]>([]);
  const kosongSejak = useRef(0);
  const latihanRef = useRef(latihan);
  latihanRef.current = latihan;

  const selesaikan = useCallback(() => {
    const c = kumpul.current;
    kumpul.current = [];
    if (c.length < 12) return;
    const l = latihanRef.current;
    const h = analisaGeseran(c, l.dari, l.ke, a4);
    setHasil(h);
    if (h.berhasil) setRiwayat((r) => [...r.slice(-9), h]);
  }, [a4]);

  useEffect(() => {
    if (!active) return;
    const now = performance.now();
    if (freq == null) {
      if (kosongSejak.current === 0) kosongSejak.current = now;
      else if (now - kosongSejak.current > JEDA_SELESAI_MS && kumpul.current.length > 0) {
        selesaikan();
      }
      return;
    }
    kosongSejak.current = 0;
    kumpul.current.push({ t: now, freq });
    if (kumpul.current.length > 60 * 20) kumpul.current.shift();
  }, [freq, active, selesaikan]);

  const senarIdx = Math.max(0, NAMA_SENAR.indexOf(latihan.senar));

  const rataMeleset =
    riwayat.length > 0
      ? Math.round(
          riwayat.reduce((a, h) => a + Math.abs(h.simpanganSen), 0) / riwayat.length
        )
      : null;

  return (
    <main className="page-in mx-auto max-w-3xl px-4 py-6">
      <h1 className="title-drift text-2xl font-bold">↔️ Latihan Geser Posisi</h1>
      <p className="mt-1 text-sm text-muted">
        Gesek nada bawah, geser tanpa angkat jari, tahan nada atas. Diukur tiga
        hal: mendaratnya tepat nggak, kelewat nggak, dan kelamaan nggak.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {LATIHAN.map((l) => (
          <button
            key={l.id}
            onClick={() => {
              setLatihan(l);
              setHasil(null);
              kumpul.current = [];
            }}
            className={`press rounded-xl border px-3 py-2 text-xs transition ${
              latihan.id === l.id
                ? "border-accent bg-accent/10"
                : "border-border-soft hover:border-accent/50"
            }`}
          >
            <span className="block font-semibold">
              senar {l.senar} · posisi {l.posisi}
            </span>
            <span className="text-muted">
              {labelFor(l.dari, labelMode)} → {labelFor(l.ke, labelMode)}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!active ? (
          <button
            onClick={async () => {
              setHasil(null);
              clear();
              kumpul.current = [];
              await start();
            }}
            className="press lift rounded-full bg-accent px-6 py-3 font-semibold text-background transition-colors hover:bg-accent-strong"
          >
            🎤 Mulai
          </button>
        ) : (
          <button
            onClick={() => {
              selesaikan();
              stop();
            }}
            className="press rounded-full border border-border-soft px-6 py-3 font-semibold transition hover:border-accent"
          >
            ⏹ Selesai
          </button>
        )}
        <button
          onClick={() => {
            playTone(midiToFreq(latihan.dari), 0.7);
            window.setTimeout(() => playTone(midiToFreq(latihan.ke), 0.9), 800);
          }}
          className="press rounded-full border border-border-soft px-4 py-2.5 text-sm transition hover:border-accent"
        >
          🔊 Contohin
        </button>
        <LabelSwitch />
      </div>

      {error && (
        <p className="animate-fade-up mt-3 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm">
          {error}
        </p>
      )}

      {/* Gambar leher biolanya, bukan cuma dua huruf.
          Yang perlu dilihat murid itu JARAKNYA — seberapa jauh tangannya harus
          pindah — dan jarak itu tidak bisa disampaikan tulisan "B → D". */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-6 rounded-2xl border border-border-soft bg-surface p-5">
        <Fingerboard
          titik={[
            {
              senar: senarIdx,
              semiton: latihan.dari - SENAR_MIDI[senarIdx],
              label: labelFor(latihan.dari, labelMode),
              jenis: "mulai",
            },
            {
              senar: senarIdx,
              semiton: latihan.ke - SENAR_MIDI[senarIdx],
              label: labelFor(latihan.ke, labelMode),
              jenis: "tujuan",
            },
          ]}
          geseran={{
            senar: senarIdx,
            dari: latihan.dari - SENAR_MIDI[senarIdx],
            ke: latihan.ke - SENAR_MIDI[senarIdx],
          }}
        />
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-xs text-muted">Mulai dari</span>
            <div className="text-3xl font-bold text-good">
              {labelFor(latihan.dari, labelMode)}
            </div>
          </div>
          <div className="text-xl text-muted">
            <span className={active ? "animate-wiggle inline-block" : ""}>↓</span>
          </div>
          <div>
            <span className="text-xs text-muted">Mendarat di</span>
            <div
              className={`text-3xl font-bold text-accent-strong ${active ? "animate-float" : ""}`}
            >
              {labelFor(latihan.ke, labelMode)}
            </div>
          </div>
          <p className="max-w-[190px] text-[11px] text-muted">
            Garis hijau tipis = tempat stiker huruf di posisi 1. Perhatiin jarak
            antar nada makin ke bawah makin RAPAT — itu sebabnya geser ke posisi
            tinggi gampang kelewat.
          </p>
        </div>
      </div>

      {hasil && (
        <div className="mt-4">
          <AnalysisCard analysis={nilai(hasil)} onClose={() => setHasil(null)} />
        </div>
      )}

      {riwayat.length > 1 && (
        <div className="animate-fade-up mt-4 rounded-2xl border border-border-soft bg-surface p-4">
          <h2 className="text-sm font-semibold">
            Percobaan terakhir{rataMeleset != null && ` · rata-rata meleset ${rataMeleset} sen`}
          </h2>
          <div className="mt-2 flex h-20 items-end gap-1.5">
            {riwayat.map((h, i) => {
              const tinggi = Math.min(100, (Math.abs(h.simpanganSen) / 50) * 100);
              const bagus = Math.abs(h.simpanganSen) <= WAJAR_GESER.simpanganSen;
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={`animate-bar w-full rounded-t ${bagus ? "bg-good" : "bg-bad"}`}
                    style={{ height: `${Math.max(6, tinggi)}%` }}
                    title={`${h.simpanganSen} sen`}
                  />
                  <span className="text-[9px] text-muted">
                    {h.simpanganSen > 0 ? "+" : ""}
                    {h.simpanganSen}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Batang pendek = mendarat tepat. Kalau semuanya condong ke satu arah
            (selalu ketinggian atau selalu kerendahan), itu bukan soal
            konsentrasi — patokan jarak tangannya yang perlu digeser.
          </p>
        </div>
      )}

      <SessionEval report={report} onClose={clear} />
    </main>
  );
}
