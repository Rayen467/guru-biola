"use client";

// Menilai kualitas bunyi gesekan — bukan nadanya.
//
// Halaman lain sudah mengurus nada. Yang ini mengurus hal yang selalu ditegur
// guru tapi tidak pernah bisa dicek sendiri: bunyinya kasar, ngempos, atau
// sudah benar. Telinga sendiri payah untuk ini karena kepala pemain menempel
// ke biolanya — yang dia dengar bukan yang didengar orang lain.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePitch } from "@/lib/usePitch";
import { useSensitivity } from "@/lib/micSettings";
import { labelFor, useLabelMode } from "@/lib/noteLabel";
import { useSessionEval } from "@/lib/sessionEval";
import SessionEval from "@/components/SessionEval";
import AnalysisCard, { type Analysis } from "@/components/AnalysisCard";
import LiveWave from "@/components/LiveWave";
import {
  ukurBunyi,
  nilaiBunyi,
  WAJAR_BUNYI,
  type UkuranBunyi,
  type PenilaianBunyi,
} from "@/lib/toneQuality";

const FFT = 4096;
const JEDA_SELESAI_MS = 320;

function saran(h: PenilaianBunyi): Analysis {
  const verdicts: Analysis["verdicts"] = [];
  let score = 100;

  if (h.arah === "kasar") {
    score -= 35;
    verdicts.push({
      icon: "🪚",
      title: "Bunyinya kasar — bow-nya kegencet",
      detail:
        "Ada banyak bunyi tinggi yang bukan bagian nadanya. Dua penyebabnya: tekanan telunjuk kegedean, atau bow-nya kedekatan ke bridge. Coba geser bow SEDIKIT menjauh dari bridge (ke arah fingerboard) sambil tekanannya dikurangi, lalu dengerin lagi.",
      tone: "bad",
    });
  } else if (h.arah === "ngempos") {
    score -= 30;
    verdicts.push({
      icon: "💨",
      title: "Bunyinya ngempos — senarnya kurang digigit",
      detail:
        "Nada dasarnya lemah, sisanya jadi desis. Biasanya bow-nya kejauhan dari bridge (kelewat ke atas fingerboard) atau tekanannya kurang. Geser bow mendekat ke bridge sedikit, tambah berat lengan — bukan dijepit jarinya — dan pelankan gesekannya.",
      tone: "bad",
    });
  } else {
    verdicts.push({
      icon: "✨",
      title: "Bunyinya udah bener",
      detail:
        "Deret nadanya jelas dan deraunya sedikit. Ini yang namanya senarnya 'kepegang' sama bow.",
      tone: "good",
    });
  }

  if (h.ratanya < WAJAR_BUNYI.ratanyaMin) {
    score -= 22;
    verdicts.push({
      icon: "📉",
      title: "Volumenya naik-turun sepanjang gesekan",
      detail:
        "Biasanya karena berat lengan berubah waktu bow mendekati ujung, atau kecepatan bow-nya gak konsisten. Latih gesekan panjang pelan sambil lihat meteran — targetnya garisnya rata dari pangkal sampai ujung bow.",
      tone: "warn",
    });
  } else {
    verdicts.push({
      icon: "📊",
      title: "Volumenya rata",
      detail: "Berat dan kecepatan bow-nya konsisten sepanjang gesekan.",
      tone: "good",
    });
  }

  if (h.kecerahan > WAJAR_BUNYI.kecerahanMaks && h.arah !== "kasar") {
    verdicts.push({
      icon: "🔆",
      title: "Warnanya terang",
      detail:
        "Harmonik tingginya kuat tapi bunyinya masih bersih. Ini bukan salah — cuma karakter yang tajam. Kalau mau lebih hangat, geser bow sedikit menjauh dari bridge.",
      tone: "good",
    });
  }

  score = Math.max(5, Math.min(100, Math.round(score)));
  return {
    score,
    headline:
      score >= 85 ? "Bunyinya bersih" : score >= 60 ? "Udah lumayan" : "Bunyinya perlu dibenerin",
    subline: `kejernihan ${Math.round(h.kejernihan * 100)}% · desis ${Math.round(h.desis * 100)}% · kerataan ${Math.round(h.ratanya * 100)}%`,
    verdicts,
  };
}

export default function SuaraPage() {
  const sensitivity = useSensitivity();
  const { freq, volumeDb, peak, active, error, reason, start, stop, getStream } =
    usePitch({ sensitivity });
  const labelMode = useLabelMode();
  const { report, clear } = useSessionEval({ active, freq, volumeDb, peak, reason });

  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  // Ditulis Float32Array<ArrayBuffer>, bukan Float32Array polos: yang polos
  // boleh menunjuk SharedArrayBuffer, dan getFloatFrequencyData menolaknya.
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const ukuran = useRef<UkuranBunyi[]>([]);
  const dbSeri = useRef<number[]>([]);
  const kosongSejak = useRef(0);
  const [hasil, setHasil] = useState<PenilaianBunyi | null>(null);
  const [langsung, setLangsung] = useState<UkuranBunyi | null>(null);
  const [midi, setMidi] = useState<number | null>(null);

  // Analyser sendiri, terpisah dari usePitch: yang dibutuhkan di sini spektrum
  // utuh, sementara usePitch cuma memberikan hasil olahannya.
  useEffect(() => {
    if (!active) {
      analyserRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      return;
    }
    const stream = getStream();
    if (!stream) return;
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = FFT;
    an.smoothingTimeConstant = 0;
    src.connect(an);
    ctxRef.current = ctx;
    analyserRef.current = an;
    // Buffernya dibikin dari ArrayBuffer biasa: tipe bawaan Float32Array bisa
    // menunjuk SharedArrayBuffer, dan getFloatFrequencyData tidak menerimanya.
    bufRef.current = new Float32Array(new ArrayBuffer(an.frequencyBinCount * 4));
    return () => {
      analyserRef.current = null;
      ctx.close().catch(() => {});
    };
  }, [active, getStream]);

  const selesaikan = useCallback(() => {
    const u = ukuran.current;
    const d = dbSeri.current;
    ukuran.current = [];
    dbSeri.current = [];
    if (u.length < 5) return;
    setHasil(nilaiBunyi(u, d));
  }, []);

  useEffect(() => {
    if (!active) return;
    const now = performance.now();
    const an = analyserRef.current;
    const buf = bufRef.current;
    if (freq == null || !an || !buf) {
      if (freq == null) {
        if (kosongSejak.current === 0) kosongSejak.current = now;
        else if (now - kosongSejak.current > JEDA_SELESAI_MS && ukuran.current.length > 0) {
          selesaikan();
        }
      }
      return;
    }
    kosongSejak.current = 0;
    // getFloatFrequencyData memberi dB; diubah ke besaran linear karena semua
    // perbandingan energi di toneQuality dihitung dari besaran, bukan dB.
    an.getFloatFrequencyData(buf);
    const mag = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) mag[i] = Math.pow(10, buf[i] / 20);
    const binHz = (ctxRef.current?.sampleRate ?? 44100) / FFT;
    const u = ukurBunyi(mag, binHz, freq);
    ukuran.current.push(u);
    dbSeri.current.push(volumeDb);
    if (ukuran.current.length > 600) ukuran.current.shift();
    if (dbSeri.current.length > 600) dbSeri.current.shift();
    setLangsung(u);
    setMidi(Math.round(69 + 12 * Math.log2(freq / 440)));
  }, [freq, volumeDb, active, selesaikan]);

  const bar = (nilai: number, warna: string) => (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className={`h-full rounded-full transition-all duration-150 ${warna}`}
        style={{ width: `${Math.round(Math.min(1, nilai) * 100)}%` }}
      />
    </div>
  );

  return (
    <main className="page-in mx-auto max-w-3xl px-4 py-6">
      <h1 className="title-drift text-2xl font-bold">🎚️ Kualitas Suara</h1>
      <p className="mt-1 text-sm text-muted">
        Gesek satu nada panjang, tahan 2 detik. Yang dinilai bukan nadanya, tapi
        bunyinya: kasar, ngempos, atau udah bener — plus rata nggaknya bow lu.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!active ? (
          <button
            onClick={async () => {
              setHasil(null);
              clear();
              ukuran.current = [];
              dbSeri.current = [];
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
      </div>

      {error && (
        <p className="animate-fade-up mt-3 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm">
          {error}
        </p>
      )}

      <div className="mt-5 rounded-2xl border border-border-soft bg-surface p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">
            {midi != null && active ? (
              <>
                Lagi ngukur{" "}
                <span className="text-xl font-bold text-accent-strong">
                  {labelFor(midi, labelMode)}
                </span>
              </>
            ) : (
              "Meteran langsung"
            )}
          </span>
          {active && (
            <span className="listen-bar inline-block h-2 w-2 rounded-full bg-accent" />
          )}
        </div>
        {/* Bentuk gelombangnya sendiri, bukan cuma tinggi batangnya. Gesekan
            yang bergetar kelihatan di sini sebelum angkanya keluar. */}
        <LiveWave stream={getStream()} active={active} height={88} />

        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-muted">
              <span>Kejernihan — makin panjang makin bersih</span>
              <span>{langsung ? `${Math.round(langsung.kejernihan * 100)}%` : "—"}</span>
            </div>
            {bar(langsung?.kejernihan ?? 0, "bg-good")}
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-muted">
              <span>Desis — makin panjang makin kasar</span>
              <span>{langsung ? `${Math.round(langsung.desis * 100)}%` : "—"}</span>
            </div>
            {bar(langsung?.desis ?? 0, "bg-bad")}
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-muted">
              <span>Warna — kiri hangat, kanan tajam</span>
              <span>{langsung ? langsung.kecerahan.toFixed(1) : "—"}</span>
            </div>
            {bar((langsung?.kecerahan ?? 0) / 8, "bg-accent")}
          </div>
        </div>
        {active && !langsung && (
          <p className="mt-3 animate-pulse text-center text-xs text-muted">
            Belum ada gesekan yang kedengeran.
          </p>
        )}
      </div>

      {hasil && !hasil.cukupData && hasil.alasan && (
        <p className="animate-fade-up mt-4 rounded-xl border border-border-soft bg-surface p-3 text-sm text-muted">
          {hasil.alasan}
        </p>
      )}

      {hasil?.cukupData && (
        <div className="mt-4">
          <AnalysisCard analysis={saran(hasil)} onClose={() => setHasil(null)} />
        </div>
      )}

      <SessionEval report={report} onClose={clear} />
    </main>
  );
}
