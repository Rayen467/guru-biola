"use client";

// Analisis vibrato: tahan satu nada, alat ini mengukur goyangannya.
//
// Vibrato itu satu-satunya bagian teknik biola yang paling susah dinilai
// sendiri — telinga cepat terbiasa dengan goyangan sendiri, jadi yang terlalu
// cepat atau tidak rata tetap terdengar wajar bagi pemainnya. Angka tidak ikut
// terbiasa.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePitch } from "@/lib/usePitch";
import { useSensitivity } from "@/lib/micSettings";
import { useA4 } from "@/lib/notes";
import { labelFor, useLabelMode } from "@/lib/noteLabel";
import LabelSwitch from "@/components/LabelSwitch";
import { useSessionEval } from "@/lib/sessionEval";
import SessionEval from "@/components/SessionEval";
import AnalysisCard, { type Analysis } from "@/components/AnalysisCard";
import {
  analisaVibrato,
  centsFromMidi,
  WAJAR,
  type Cuplik,
  type HasilVibrato,
} from "@/lib/vibrato";

// Jeda sebesar ini tanpa nada dianggap gesekan sudah selesai.
const JEDA_SELESAI_MS = 260;
const TAMPIL_DETIK = 5; // lebar jendela grafik
const SKALA_SEN = 60; // tinggi grafik = ±60 sen

function saran(h: HasilVibrato): Analysis {
  const verdicts: Analysis["verdicts"] = [];
  let score = 100;

  if (!h.adaVibrato) {
    return {
      score: 0,
      headline: "Belum ada vibrato",
      subline: h.alasan ?? "Nadanya lurus — belum ada goyangan yang kebaca.",
      verdicts: [
        {
          icon: "📏",
          title: "Nadanya lurus",
          detail:
            "Buat mulai: tempelkan jari, lalu goyangkan LENGAN BAWAH dari siku, bukan jari atau pergelangan saja. Pelan dulu, 3–4 goyangan per detik, sengaja dilebar-lebarin. Rapi belakangan.",
          tone: "warn",
        },
      ],
    };
  }

  // Kecepatan
  if (h.kecepatanHz < WAJAR.kecepatanMin) {
    score -= 22;
    verdicts.push({
      icon: "🐢",
      title: `Kecepatan ${h.kecepatanHz} Hz — kepelanan`,
      detail: `Biola biasanya ${WAJAR.kecepatanMin}–${WAJAR.kecepatanMaks} goyangan per detik. Yang kepelanan kedengeran ragu. Coba ikut metronom: setel 80, dua goyangan tiap ketukan.`,
      tone: "warn",
    });
  } else if (h.kecepatanHz > WAJAR.kecepatanMaks) {
    score -= 18;
    verdicts.push({
      icon: "🐇",
      title: `Kecepatan ${h.kecepatanHz} Hz — kecepetan`,
      detail:
        "Biasanya ini tanda tangan atau bahu tegang, jadi goyangannya jadi getaran kecil. Lemesin bahu, turunkan siku sedikit, dan sengaja lebarin goyangannya — otomatis melambat.",
      tone: "warn",
    });
  } else {
    verdicts.push({
      icon: "⏱️",
      title: `Kecepatan ${h.kecepatanHz} Hz — pas`,
      detail: `Masuk rentang yang lazim buat biola (${WAJAR.kecepatanMin}–${WAJAR.kecepatanMaks} Hz).`,
      tone: "good",
    });
  }

  // Lebar
  if (h.lebarSen < WAJAR.lebarMin) {
    score -= 20;
    verdicts.push({
      icon: "🔉",
      title: `Lebar ±${h.lebarSen} sen — ketipisan`,
      detail:
        "Dari jauh goyangan setipis ini hampir gak kedengeran. Biarkan ujung jari sedikit menggulung ke belakang lalu balik lagi — jangan cuma menekan di tempat.",
      tone: "warn",
    });
  } else if (h.lebarSen > WAJAR.lebarMaks) {
    score -= 16;
    verdicts.push({
      icon: "🌊",
      title: `Lebar ±${h.lebarSen} sen — kelebaran`,
      detail:
        "Nadanya jadi kabur, orang susah nangkep nada apa yang dimaksud. Perkecil ayunan lengannya, jangan geser seluruh tangan.",
      tone: "warn",
    });
  } else {
    verdicts.push({
      icon: "📐",
      title: `Lebar ±${h.lebarSen} sen — pas`,
      detail: "Cukup kedengeran tanpa bikin nadanya kabur.",
      tone: "good",
    });
  }

  // Kerataan — ini yang paling membedakan terlatih atau belum
  const takRata = Math.max(h.kerataanPeriode, h.kerataanLebar);
  if (takRata > WAJAR.kerataanMaks) {
    score -= 25;
    verdicts.push({
      icon: "〰️",
      title: "Goyangannya belum rata",
      detail: `Jarak antar goyangan meleset ${Math.round(h.kerataanPeriode * 100)}% dan lebarnya ${Math.round(h.kerataanLebar * 100)}%. Latih pakai metronom, hitung goyangannya keras-keras, dan tahan bow-nya tetap rata — vibrato yang goyah hampir selalu gara-gara bow ikut goyah.`,
      tone: "bad",
    });
  } else {
    verdicts.push({
      icon: "✨",
      title: "Goyangannya rata",
      detail: "Jarak dan lebar tiap goyangan konsisten. Ini bagian tersusah dan udah kepegang.",
      tone: "good",
    });
  }

  // Pusat nada
  if (Math.abs(h.pusatSen) > 15) {
    score -= 15;
    verdicts.push({
      icon: h.pusatSen > 0 ? "⬆️" : "⬇️",
      title: `Pusat goyangan ${Math.abs(h.pusatSen)} sen ${h.pusatSen > 0 ? "ketinggian" : "kerendahan"}`,
      detail:
        "Goyangannya sendiri oke, tapi titik tengahnya bukan di nada yang dimaksud. Cek dulu nadanya pakai tuner TANPA vibrato, baru mulai goyang dari situ.",
      tone: "warn",
    });
  }

  score = Math.max(5, Math.min(100, score));
  return {
    score,
    headline:
      score >= 85
        ? "Vibratonya udah jadi"
        : score >= 60
          ? "Udah kebentuk, tinggal dirapiin"
          : "Masih perlu dibangun",
    subline: `${h.kecepatanHz} Hz · ±${h.lebarSen} sen · ${h.jumlahGoyangan} goyangan dalam ${h.durasiDetik.toFixed(1)} detik`,
    verdicts,
  };
}

export default function VibratoPage() {
  const sensitivity = useSensitivity();
  const { freq, volumeDb, peak, active, error, reason, start, stop } = usePitch({
    sensitivity,
    stableMs: 40, // vibrato itu nada yang bergerak; jangan disaring terlalu sabar
  });
  const a4 = useA4();
  const labelMode = useLabelMode();
  const { report, clear } = useSessionEval({ active, freq, volumeDb, peak, reason });

  const kumpul = useRef<Cuplik[]>([]);
  const kosongSejak = useRef<number>(0);
  const [jejak, setJejak] = useState<{ t: number; sen: number }[]>([]);
  const [hasil, setHasil] = useState<HasilVibrato | null>(null);
  const [midiSekarang, setMidiSekarang] = useState<number | null>(null);

  const selesaikan = useCallback(() => {
    const c = kumpul.current;
    kumpul.current = [];
    if (c.length < 20) return;
    setHasil(analisaVibrato(c, a4));
  }, [a4]);

  // Kumpulkan bacaan nada. Ditulis ke ref, bukan state, supaya deretnya tidak
  // ikut hilang tiap kali React menggambar ulang.
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
    // Jaga jangan sampai satu nada ditahan semenit lalu memakan memori.
    if (kumpul.current.length > 60 * 30) kumpul.current.shift();

    const tengah = kumpul.current[Math.floor(kumpul.current.length / 2)].freq;
    const midi = Math.round(69 + 12 * Math.log2(tengah / a4));
    setMidiSekarang(midi);
    const batas = now - TAMPIL_DETIK * 1000;
    setJejak(
      kumpul.current
        .filter((c) => c.t >= batas)
        .map((c) => ({ t: c.t, sen: centsFromMidi(c.freq, midi, a4) }))
    );
  }, [freq, active, a4, selesaikan]);

  const mulai = async () => {
    setHasil(null);
    clear();
    kumpul.current = [];
    setJejak([]);
    await start();
  };

  const berhenti = () => {
    selesaikan();
    stop();
  };

  // Grafik: garis nada terhadap waktu. Ini inti halamannya — goyangan yang
  // tidak rata langsung kelihatan sebagai gelombang yang tinggi-rendahnya beda,
  // jauh sebelum angkanya dibaca.
  const W = 640;
  const H = 160;
  const kini = jejak.length ? jejak[jejak.length - 1].t : 0;
  const titik = jejak
    .map((p) => {
      const x = W - ((kini - p.t) / (TAMPIL_DETIK * 1000)) * W;
      const y = H / 2 - (Math.max(-SKALA_SEN, Math.min(SKALA_SEN, p.sen)) / SKALA_SEN) * (H / 2 - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <main className="page-in mx-auto max-w-3xl px-4 py-6">
      <h1 className="title-drift text-2xl font-bold">〰️ Analisis Vibrato</h1>
      <p className="mt-1 text-sm text-muted">
        Tahan satu nada pakai vibrato minimal 2 detik. Nanti diukur kecepatan,
        lebar, dan yang paling penting: rata atau nggaknya.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!active ? (
          <button
            onClick={mulai}
            className="press lift rounded-full bg-accent px-6 py-3 font-semibold text-background transition-colors hover:bg-accent-strong"
          >
            🎤 Mulai
          </button>
        ) : (
          <button
            onClick={berhenti}
            className="press rounded-full border border-border-soft px-6 py-3 font-semibold transition hover:border-accent"
          >
            ⏹ Selesai
          </button>
        )}
        <LabelSwitch />
      </div>

      {error && (
        <p className="animate-fade-up mt-3 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm">
          {error}
        </p>
      )}

      <div className="mt-5 rounded-2xl border border-border-soft bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">
            {midiSekarang != null && active ? (
              <>
                Nada:{" "}
                <span className="text-xl font-bold text-accent-strong">
                  {labelFor(midiSekarang, labelMode)}
                </span>
              </>
            ) : (
              "Grafik nada"
            )}
          </span>
          <span className="text-xs text-muted">± {SKALA_SEN} sen · {TAMPIL_DETIK} detik terakhir</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-40 w-full">
          {/* garis nada pas di tengah, plus batas ±25 sen sebagai patokan lebar wajar */}
          <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="var(--accent)" strokeWidth="1" strokeDasharray="4 4" opacity="0.7" />
          {[-25, 25].map((c) => (
            <line
              key={c}
              x1="0"
              y1={H / 2 - (c / SKALA_SEN) * (H / 2 - 6)}
              x2={W}
              y2={H / 2 - (c / SKALA_SEN) * (H / 2 - 6)}
              stroke="var(--muted)"
              strokeWidth="1"
              opacity="0.25"
            />
          ))}
          {titik && (
            <polyline
              points={titik}
              fill="none"
              stroke="var(--good)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
        </svg>
        {active && jejak.length === 0 && (
          <p className="animate-pulse text-center text-xs text-muted">
            Belum kedengeran nadanya — gesek satu nada dan tahan.
          </p>
        )}
      </div>

      {hasil && !hasil.cukupData && hasil.alasan && (
        <p className="animate-fade-up mt-4 rounded-xl border border-border-soft bg-surface p-3 text-sm text-muted">
          {hasil.alasan}
        </p>
      )}

      {hasil?.cukupData && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Kecepatan", nilai: `${hasil.kecepatanHz}`, satuan: "Hz" },
              { label: "Lebar", nilai: `±${hasil.lebarSen}`, satuan: "sen" },
              { label: "Goyangan", nilai: `${hasil.jumlahGoyangan}`, satuan: "kali" },
              {
                label: "Kerataan",
                nilai: `${Math.round((1 - Math.min(1, Math.max(hasil.kerataanPeriode, hasil.kerataanLebar))) * 100)}`,
                satuan: "%",
              },
            ].map((k, i) => (
              <div
                key={k.label}
                className="animate-pop rounded-xl border border-border-soft bg-surface p-3 text-center"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="text-2xl font-bold text-accent-strong">{k.nilai}</div>
                <div className="text-[11px] text-muted">
                  {k.label} ({k.satuan})
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <AnalysisCard analysis={saran(hasil)} onClose={() => setHasil(null)} />
          </div>
        </>
      )}

      <SessionEval report={report} onClose={clear} />
    </main>
  );
}
