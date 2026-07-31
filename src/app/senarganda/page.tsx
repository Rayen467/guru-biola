"use client";

// Cek senar ganda — dua senar digesek bersamaan.
//
// Halaman ini satu-satunya yang WAJIB pakai model polifonik. Tuner dan halaman
// intonasi memakai pelacak nada tunggal, dan pelacak nada tunggal tidak cuma
// "kurang akurat" untuk dua nada sekaligus — dia menyebut nada ketiga yang
// tidak dimainkan siapa pun. Jadi selama ini senar ganda memang tidak bisa
// dicek sendiri sama sekali.

import { useCallback, useEffect, useRef, useState } from "react";
import { captureMic } from "@/lib/listen";
import { labelFor, useLabelMode, type LabelMode } from "@/lib/noteLabel";
import LabelSwitch from "@/components/LabelSwitch";
import AnalysisCard, { type Analysis } from "@/components/AnalysisCard";
import { setBasicPitchPath, modelEvents, resampleForModel, BASIC_PITCH_SR } from "@/lib/aiTranscribe";
import {
  analisaSenarGanda,
  keseimbanganDua,
  LATIHAN_GANDA,
  WAJAR_GANDA,
  type HasilSenarGanda,
  type LatihanGanda,
} from "@/lib/doubleStop";
import { midiToFreq } from "@/lib/notes";
import { playTone } from "@/lib/tone";

const REKAM_DETIK = 3;

function nilai(
  h: HasilSenarGanda,
  latihan: LatihanGanda,
  label: LabelMode
): Analysis {
  if (!h.berhasil) {
    return {
      score: 0,
      headline: "Belum kebaca",
      subline: h.alasan ?? "",
      verdicts: [
        {
          icon: "🎤",
          title: "Coba lagi",
          detail: "Gesek dua senarnya barengan dan tahan sampai hitungan berhenti.",
          tone: "warn",
        },
      ],
    };
  }

  const verdicts: Analysis["verdicts"] = [];
  let score = 100;

  if (h.nada.length < 2) {
    return {
      score: 20,
      headline: "Cuma satu senar yang bunyi",
      subline: `Yang kedengeran cuma ${h.nada.map((m) => labelFor(m, label)).join("")}`,
      verdicts: [
        {
          icon: "🎻",
          title: "Bow-nya belum nempel dua-duanya",
          detail:
            "Turunkan sudut bow sampai rambutnya menyentuh dua senar sekaligus, lalu tambah berat lengan sedikit. Gampangnya: gesek pelan dan panjang dulu, jangan cepat.",
          tone: "bad",
        },
      ],
    };
  }

  if (h.cocok) {
    verdicts.push({
      icon: "🎯",
      title: `Nadanya bener — ${h.namaJarak}`,
      detail: `Dua-duanya kedengeran: ${h.nada.map((m) => labelFor(m, label)).join(" + ")}.`,
      tone: "good",
    });
  } else {
    score -= 40;
    const kurang = h.kurang.map((m) => labelFor(m, label)).join(", ");
    const lebih = h.lebih.map((m) => labelFor(m, label)).join(", ");
    verdicts.push({
      icon: "❌",
      title: `Yang kedengeran ${h.namaJarak}, bukan yang diminta`,
      detail:
        (kurang ? `Nada ${kurang} gak kedengeran. ` : "") +
        (lebih ? `Malah kedengeran ${lebih}. ` : "") +
        "Cek jarinya dulu satu-satu tanpa senar ganda, baru gabungin.",
      tone: "bad",
    });
  }

  if (h.keseimbangan == null) {
    verdicts.push({
      icon: "🤷",
      title: "Keseimbangannya gak bisa diukur di latihan ini",
      detail:
        "Nada atasnya pas jatuh di dengung nada bawahnya (oktaf), jadi gak ada cara misahin mana yang dari senar atas dan mana yang cuma dengung. Buat ngecek bow-nya rata, pakai latihan yang jaraknya bukan oktaf.",
      tone: "good",
    });
  } else if (h.keseimbangan < WAJAR_GANDA.keseimbanganMin) {
    score -= 30;
    verdicts.push({
      icon: "⚖️",
      title: `Timpang — satu senar cuma ${Math.round(h.keseimbangan * 100)}% dari satunya`,
      detail:
        "Bow-nya lebih nempel ke satu senar. Betulin sudutnya: bayangin rambut bow duduk PERSIS di lembah antara dua senar, jangan condong. Ini soal sudut, bukan tenaga.",
      tone: "bad",
    });
  } else {
    verdicts.push({
      icon: "⚖️",
      title: `Seimbang (${Math.round(h.keseimbangan * 100)}%)`,
      detail: "Dua senarnya bunyi sama keras — sudut bow-nya udah pas.",
      tone: "good",
    });
  }

  score = Math.max(5, Math.min(100, score));
  return {
    score,
    headline: score >= 85 ? "Senar gandanya bersih" : score >= 55 ? "Udah kepegang, tinggal dirapiin" : "Masih perlu dilatih",
    subline: `${latihan.nama} · kedengeran ${h.nada.map((m) => labelFor(m, label)).join(" + ")}`,
    verdicts,
  };
}

export default function SenarGandaPage() {
  const labelMode = useLabelMode();
  const [latihan, setLatihan] = useState<LatihanGanda>(LATIHAN_GANDA[0]);
  const [tahap, setTahap] = useState<"diam" | "rekam" | "olah">("diam");
  const [sisa, setSisa] = useState(REKAM_DETIK);
  const [hasil, setHasil] = useState<HasilSenarGanda | null>(null);
  const [error, setError] = useState<string | null>(null);
  const batal = useRef(false);

  useEffect(() => {
    setBasicPitchPath(process.env.NEXT_PUBLIC_BASE_PATH ?? "");
    return () => {
      batal.current = true;
    };
  }, []);

  const rekam = useCallback(async () => {
    setError(null);
    setHasil(null);
    let stream: MediaStream | null = null;
    try {
      stream = await captureMic();
      setTahap("rekam");

      const potongan: Blob[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) potongan.push(e.data);
      };
      const selesai = new Promise<void>((r) => {
        rec.onstop = () => r();
      });
      rec.start();

      for (let d = REKAM_DETIK; d > 0; d--) {
        setSisa(d);
        await new Promise((r) => window.setTimeout(r, 1000));
      }
      rec.stop();
      await selesai;
      stream.getTracks().forEach((t) => t.stop());
      stream = null;

      setTahap("olah");
      const blob = new Blob(potongan, { type: potongan[0]?.type || "audio/webm" });
      const ctx = new AudioContext();
      const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
      await ctx.close();

      // Model butuh 22.050 Hz mono; ukuran keseimbangan juga dihitung dari
      // gelombang yang sama supaya keduanya bicara soal rekaman yang sama.
      const mono = await resampleForModel(audio);
      const pcm = mono.getChannelData(0);
      const ev = await modelEvents(pcm, { minFreq: 170, maxFreq: 2100 });
      const h = analisaSenarGanda(ev, latihan.midis);
      if (h.nada.length === 2) {
        h.keseimbangan = keseimbanganDua(
          pcm,
          BASIC_PITCH_SR,
          midiToFreq(h.nada[0]),
          midiToFreq(h.nada[1])
        );
      }
      setHasil(h);
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Izin mic ditolak. Klik gembok di address bar → Microphone → Allow."
          : `Gagal: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      setTahap("diam");
      setSisa(REKAM_DETIK);
    }
  }, [latihan]);

  return (
    <main className="page-in mx-auto max-w-3xl px-4 py-6">
      <h1 className="title-drift text-2xl font-bold">🎻🎻 Cek Senar Ganda</h1>
      <p className="mt-1 text-sm text-muted">
        Dua senar digesek barengan. Dicek pakai model polifonik — tuner biasa
        gak bisa, karena dia cuma sanggup ngikutin satu nada.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {LATIHAN_GANDA.map((l) => (
          <button
            key={l.id}
            onClick={() => {
              setLatihan(l);
              setHasil(null);
            }}
            disabled={tahap !== "diam"}
            className={`press rounded-xl border px-3 py-2 text-left text-xs transition disabled:opacity-50 ${
              latihan.id === l.id
                ? "border-accent bg-accent/10"
                : "border-border-soft hover:border-accent/50"
            }`}
          >
            <span className="block font-semibold">{l.nama}</span>
            <span className="text-muted">
              {l.midis.map((m) => labelFor(m, labelMode)).join(" + ")}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-2 rounded-xl border border-border-soft bg-surface p-3 text-xs text-muted">
        💡 {latihan.petunjuk}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={rekam}
          disabled={tahap !== "diam"}
          className="press lift rounded-full bg-accent px-6 py-3 font-semibold text-background transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {tahap === "rekam"
            ? `🔴 Gesek terus… ${sisa}`
            : tahap === "olah"
              ? "🧠 Lagi dibaca…"
              : `🎤 Rekam ${REKAM_DETIK} detik`}
        </button>
        <button
          onClick={() => {
            latihan.midis.forEach((m) => playTone(midiToFreq(m), 1.6));
          }}
          disabled={tahap !== "diam"}
          className="press rounded-full border border-border-soft px-4 py-2.5 text-sm transition hover:border-accent disabled:opacity-50"
        >
          🔊 Contohin
        </button>
        <LabelSwitch />
      </div>

      {tahap === "rekam" && (
        <div className="animate-fade-up mt-4 flex items-center justify-center gap-4 rounded-2xl border border-accent/50 bg-accent/5 p-6">
          {latihan.midis.map((m) => (
            <span key={m} className="animate-float text-4xl font-bold text-accent-strong">
              {labelFor(m, labelMode)}
            </span>
          ))}
        </div>
      )}

      {tahap === "olah" && (
        <div className="animate-fade-up shimmer mt-4 rounded-2xl border border-border-soft bg-surface p-6 text-center text-sm text-muted">
          Model polifoniknya lagi misahin dua nadanya… (beberapa detik)
        </div>
      )}

      {error && (
        <p className="animate-fade-up mt-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm">
          {error}
        </p>
      )}

      {hasil && (
        <div className="mt-4">
          <AnalysisCard
            analysis={nilai(hasil, latihan, labelMode)}
            onClose={() => setHasil(null)}
          />
        </div>
      )}

      <p className="mt-6 text-xs text-muted">
        Modelnya jalan di perangkat lu sendiri — gak ada audio yang dikirim ke
        mana pun, dan gak butuh API key. Sekali muat ukurannya 895 KB.
      </p>
    </main>
  );
}
