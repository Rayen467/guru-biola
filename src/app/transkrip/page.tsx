"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureMic,
  captureTabAudio,
  listenFrames,
  type Listener,
} from "@/lib/listen";
import { midiToName } from "@/lib/notes";
import { fingerHint, notesToSong, saveCustomSong } from "@/lib/songs";
import {
  VIOLIN_HIGH,
  VIOLIN_LOW,
  finishFrames,
  guessBpm,
  quantize,
  transcribeBuffer,
  type RawNote,
} from "@/lib/transcribe";
import AnalysisCard, { type Analysis } from "@/components/AnalysisCard";
import Staff from "@/components/Staff";
import LabelSwitch from "@/components/LabelSwitch";
import { labelFor, useLabelMode } from "@/lib/noteLabel";
import {
  KEY_NAMES,
  MelodyPlayer,
  guessKey,
  snapToKey,
} from "@/lib/melodyPlayer";

// Ubah lagu jadi not biola.
//
// Dua sumber: berkas audio milik sendiri, atau suara dari speaker — puter
// lagunya di Spotify/YouTube, app-nya yang dengerin. Sengaja TIDAK menarik
// audio dari layanan itu: Spotify terkunci DRM dan tidak menyediakan audio
// lewat API, dan mengunduh dari YouTube melanggar ketentuannya.

export default function TranskripPage() {
  // Penangkap nada polos — BUKAN usePitch. usePitch nolak apa pun yang
  // timbrenya bukan dawai digesek, jadi kalau dipakai di sini, lagu vokal atau
  // piano bakal dibuang mentah-mentah.
  const [listener, setListener] = useState<Listener | null>(null);
  const [level, setLevel] = useState(0);
  const [jumlahFrame, setJumlahFrame] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const active = listener !== null;

  const [mode, setMode] = useState<"berkas" | "tab" | "mic">("tab");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notes, setNotes] = useState<RawNote[]>([]);
  const [bpm, setBpm] = useState(90);
  const [judul, setJudul] = useState("");
  const [pesan, setPesan] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [octave, setOctave] = useState(0);
  // Pembersih: buang not super pendek + luruskan nada nyasar ke tangga nada.
  const [minMs, setMinMs] = useState(120);
  const [snap, setSnap] = useState(true);
  // Wilayah nada yang dianggap melodi. Bass dan bass drum ada di bawah 180 Hz
  // dan cuma bikin pelacak nada bingung.
  const [fokus, setFokus] = useState<"melodi" | "lebar">("melodi");
  const [mainIdx, setMainIdx] = useState(-1);
  const [memutar, setMemutar] = useState(false);
  // Bawaannya waktu asli: yang didengar harus sama persis dengan yang terdeteksi.
  // Versi rapi (dibulatkan ke ketukan) buat latihan, bukan buat memeriksa hasil.
  const [pakaiWaktuAsli, setPakaiWaktuAsli] = useState(true);
  const player = useRef(new MelodyPlayer());
  const labelMode = useLabelMode();

  useEffect(() => {
    const p = player.current;
    return () => p.stop();
  }, []);

  // Meteran level + hitungan bacaan, biar kelihatan alatnya beneran denger.
  useEffect(() => {
    if (!listener) return;
    const id = window.setInterval(() => {
      setLevel(listener.level());
      setJumlahFrame(listener.frames.length);
    }, 200);
    return () => window.clearInterval(id);
  }, [listener]);

  // Kalau halaman ditinggal sementara stream masih jalan, lepas perangkatnya.
  useEffect(() => {
    return () => {
      listener?.stop();
    };
  }, [listener]);

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
      const hasil = await transcribeBuffer(audio, {
        onProgress: setProgress,
        loHz: fokus === "melodi" ? 180 : 120,
        // Jangan dipotong terlalu rendah: pelacak nada butuh beberapa harmonik
        // buat memastikan nada dasarnya. Kalau harmonik ke-3 ikut kebuang, dia
        // gampang salah tebak ke nada satu kuint di bawahnya.
        hiHz: fokus === "melodi" ? 3200 : 5000,
      });
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
    setNotes([]);
    setPesan(null);
    setAnalysis(null);
    setError(null);
    setJumlahFrame(0);
    try {
      const stream = mode === "tab" ? await captureTabAudio() : await captureMic();
      const l = listenFrames(stream);
      setListener(l);
      // Kalau user menghentikan berbagi lewat tombol bawaan browser, jangan
      // biarkan halaman ini menggantung mengira masih merekam.
      stream.getAudioTracks()[0]?.addEventListener("ended", () => selesai(l));
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Izin ditolak. Buat mode tab: pilih tabnya lalu CENTANG 'Also share tab audio'."
          : e instanceof Error
            ? e.message
            : String(e)
      );
    }
  };

  const selesai = useCallback(
    (l?: Listener) => {
      const target = l ?? listener;
      if (!target) return;
      const frames = target.stop();
      setListener(null);
      // Jalur pembersih yang sama persis dengan mode berkas: saring lompatan,
      // koreksi setelan tuning rekaman, benerin lompat oktaf, baru gabung.
      const hasil = finishFrames(frames);
      setNotes(hasil);
      setBpm(guessBpm(hasil));
      setAnalysis(
        buildAnalysis(hasil, frames.length ? frames[frames.length - 1].t / 1000 : 0)
      );
      if (hasil.length === 0) {
        setPesan(
          mode === "tab"
            ? "Gak ada nada ketangkep. Paling sering: kotak 'Also share tab audio' belum dicentang, atau lagunya lagi gak diputar."
            : "Gak ada nada ketangkep. Cek speakernya kekecilan, mic kejauhan, atau lagunya kebanyakan instrumen bareng."
        );
      }
    },
    [listener, mode]
  );

  // Urutan pembersihan: buang not terlalu pendek dulu (itu paling sering
  // cuma serangan bunyi, bukan not), baru geser oktaf, baru luruskan ke
  // tangga nada — kalau dibalik, nada nyasar ikut memengaruhi tebakan kunci.
  const cukupPanjang = notes.filter((n) => n.durMs >= minMs);
  const digeser = cukupPanjang.map((n) => ({ ...n, midi: n.midi + octave * 12 }));
  const kunci = digeser.length ? guessKey(digeser.map((n) => n.midi)) : 0;
  const diluruskan = snap
    ? snapToKey(digeser.map((n) => n.midi), kunci).map((midi, i) => ({
        ...digeser[i],
        midi,
      }))
    : digeser;
  const tampil = diluruskan.filter(
    (n) => n.midi >= VIOLIN_LOW && n.midi <= VIOLIN_HIGH
  );
  const dibuang = notes.length - tampil.length;

  const dengarkan = () => {
    if (memutar) {
      player.current.stop();
      setMemutar(false);
      setMainIdx(-1);
      return;
    }
    setMemutar(true);
    if (pakaiWaktuAsli) {
      // Waktu asli hasil deteksi, lengkap dengan jeda antar not — inilah yang
      // sebenarnya terbaca. Kalau ini kedengeran beda dari lagunya, berarti
      // deteksinya yang salah, bukan pemutarnya.
      player.current.playTimed(
        tampil.map((n) => ({ midi: n.midi, startMs: n.startMs, durMs: n.durMs })),
        {
          onNote: setMainIdx,
          onEnd: () => {
            setMemutar(false);
            setMainIdx(-1);
          },
        }
      );
    } else {
      player.current.play(quantize(tampil, bpm), bpm, {
        onNote: setMainIdx,
        onEnd: () => {
          setMemutar(false);
          setMainIdx(-1);
        },
      });
    }
  };

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

      <div className="flex flex-wrap gap-2">
        {(
          [
            { v: "tab" as const, label: "🖥️ Dari tab Spotify/YouTube" },
            { v: "berkas" as const, label: "📁 Dari berkas audio" },
            { v: "mic" as const, label: "🎧 Lewat mic (speaker)" },
          ]
        ).map((m) => (
          <button
            key={m.v}
            onClick={() => setMode(m.v)}
            className={`press flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs sm:text-sm ${
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
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-muted">Fokus:</span>
              {(
                [
                  { v: "melodi" as const, label: "🎯 Melodi (buang bass & drum)" },
                  { v: "lebar" as const, label: "🌐 Semua nada" },
                ]
              ).map((f) => (
                <button
                  key={f.v}
                  onClick={() => setFokus(f.v)}
                  className={`press rounded-full px-3 py-1.5 text-[11px] ${
                    fokus === f.v
                      ? "bg-accent font-semibold text-background"
                      : "bg-surface-2 text-muted hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
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
            {mode === "tab" ? (
              <div className="mx-auto max-w-lg space-y-2 text-left text-sm text-muted">
                <p>
                  Cara ini paling bersih: suaranya diambil <b>langsung dari tab</b>,
                  bukan lewat udara — gak kena gema ruangan atau suara sekitar.
                </p>
                <ol className="list-inside list-decimal space-y-1 text-xs">
                  <li>Buka lagunya di tab lain (Spotify Web / YouTube), puter.</li>
                  <li>Balik ke sini, tekan tombol di bawah.</li>
                  <li>
                    Pilih <b>tab</b> lagunya, dan <b className="text-accent-strong">
                    centang &quot;Also share tab audio&quot;</b> di pojok kiri bawah.
                    Tanpa centang itu, yang kebagi cuma gambar.
                  </li>
                </ol>
                <p className="text-xs">
                  Cuma jalan di komputer (Chrome/Edge/Brave). Di HP, browser gak
                  ngasih akses audio tab — pakai mode mic.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">
                Puter lagunya lewat speaker, dekatkan ke mic, lalu tekan mulai.
                Makin sepi ruangannya makin bagus hasilnya.
              </p>
            )}

            <button
              onClick={active ? () => selesai() : mulaiDengar}
              className={`press rounded-full px-6 py-2.5 font-semibold ${
                active
                  ? "bg-bad text-background"
                  : "bg-accent text-background hover:bg-accent-strong"
              }`}
            >
              {active
                ? "■ Selesai & ubah jadi not"
                : mode === "tab"
                  ? "🖥️ Pilih tab & mulai"
                  : "🎧 Mulai dengerin"}
            </button>

            {active && (
              <div className="space-y-2">
                <div className="mx-auto flex h-8 max-w-xs items-end justify-center gap-1">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <span
                      key={i}
                      className="listen-bar w-2 rounded-sm bg-accent"
                      style={{ height: `${15 + level * 85}%` }}
                    />
                  ))}
                </div>
                <p className="text-xs text-accent-strong">
                  Lagi nangkep… {jumlahFrame} bacaan
                  {level < 0.02 && " · suaranya belum kedengeran"}
                </p>
              </div>
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

          {/* Dengar dulu sebelum dilatih — telinga nangkep nada nyasar jauh
              lebih cepat daripada mata baca daftar nama nada. */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 p-3">
            <button
              onClick={dengarkan}
              className={`press rounded-full px-5 py-2 text-sm font-semibold ${
                memutar
                  ? "bg-bad text-background"
                  : "bg-accent text-background hover:bg-accent-strong"
              }`}
            >
              {memutar ? "■ Stop" : "🎻 Dengar hasilnya"}
            </button>
            <button
              onClick={() => setPakaiWaktuAsli((v) => !v)}
              className={`press rounded-full px-3 py-1.5 text-[11px] ${
                pakaiWaktuAsli
                  ? "bg-accent font-semibold text-background"
                  : "bg-surface text-muted"
              }`}
              title="Waktu asli = persis seperti yang terdeteksi, lengkap dengan jedanya. Versi rapi = dibulatkan ke ketukan, enak buat latihan tapi bukan cerminan hasil deteksi."
            >
              {pakaiWaktuAsli ? "⏱️ waktu asli" : "🎼 versi rapi"}
            </button>
            <span className="text-xs text-muted">
              {pakaiWaktuAsli
                ? "Dibunyiin persis seperti yang kebaca, lengkap sama jedanya. Kalau ini kedengeran beda dari lagunya, berarti deteksinya yang meleset — bukan pemutarnya."
                : `Dibulatin ke ketukan di tempo ${bpm} BPM — enak buat latihan, tapi bukan cerminan hasil deteksi.`}
            </span>
          </div>

          {/* Not balok — jauh lebih kebaca daripada deretan nama nada */}
          <div className="overflow-x-auto rounded-lg bg-surface-2 p-2">
            <div className="mb-1 flex justify-end px-1">
              <LabelSwitch compact />
            </div>
            <Staff
              notes={quantize(tampil.slice(0, 64), bpm)}
              current={mainIdx < 64 ? mainIdx : -1}
              labels={tampil.slice(0, 64).map((n) => labelFor(n.midi, labelMode))}
            />
            {tampil.length > 64 && (
              <p className="px-2 pb-1 text-[11px] text-muted">
                Ditampilkan 64 not pertama · semuanya ({tampil.length}) tetap
                ikut kesimpen dan ikut dibunyikan.
              </p>
            )}
          </div>

          {/* Pembersih hasil */}
          <div className="space-y-3 rounded-lg bg-surface-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium">
                  Buang not lebih pendek dari {minMs} ms
                </div>
                <div className="text-[11px] text-muted">
                  Not super pendek biasanya cuma suara serangan/derik, bukan nada
                  beneran.
                </div>
              </div>
              <input
                type="range"
                min={60}
                max={400}
                step={10}
                value={minMs}
                onChange={(e) => setMinMs(Number(e.target.value))}
                className="w-40 accent-[var(--accent)]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium">
                  Luruskan ke tangga nada {KEY_NAMES[kunci]} mayor
                </div>
                <div className="max-w-sm text-[11px] text-muted">
                  Nada yang meleset satu semitone hampir selalu salah deteksi,
                  bukan not asli. Ini yang bikin hasilnya kedengeran musikal.
                </div>
              </div>
              <button
                onClick={() => setSnap((v) => !v)}
                className={`press rounded-full px-4 py-1.5 text-xs ${
                  snap
                    ? "bg-accent font-semibold text-background"
                    : "bg-surface text-muted"
                }`}
              >
                {snap ? "nyala" : "mati"}
              </button>
            </div>

            {dibuang > 0 && (
              <p className="text-[11px] text-muted">
                {dibuang} not dibuang sama saringan di atas.
              </p>
            )}
          </div>

          <details className="rounded-lg bg-surface-2 p-3">
            <summary className="cursor-pointer text-xs text-muted">
              lihat daftar nada + posisi jari
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tampil.slice(0, 200).map((n, i) => (
                <span
                  key={i}
                  title={`${fingerHint(n.midi)} · ${Math.round(n.durMs)} ms`}
                  className={`rounded-md px-2 py-1 text-xs ${
                    i === mainIdx ? "bg-accent text-background" : "bg-surface"
                  }`}
                >
                  {labelFor(n.midi, labelMode)}
                </span>
              ))}
            </div>
          </details>

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
  // Keyakinan diukur dari seberapa DIAM nada di dalam tiap not, bukan dari
  // seberapa dekat ke nada standar. Rekaman yang tuningnya beda tipis atau
  // penyanyi bervibrato tetap benar notnya — yang bikin salah itu pelacak yang
  // bingung antara beberapa suara, dan itu kelihatan dari sebarannya lebar.
  const stabil = notes.filter((n) => n.spread <= 60).length;
  const yakin = Math.round((stabil / notes.length) * 100);
  const perDetik = durasiDetik > 0 ? notes.length / durasiDetik : 0;

  const verdicts = [
    {
      icon: yakin >= 70 ? "✅" : "⚠️",
      title: `${yakin}% not nadanya mantap`,
      detail:
        yakin >= 70
          ? "Nadanya diam dan jelas — hasil transkrip ini layak dipakai latihan."
          : "Banyak not yang nadanya goyang. Itu tanda pelacaknya lagi berebut antara beberapa suara — hampir selalu karena lagunya rame (drum + bass + vokal + gitar bareng). Alat ini cuma bisa ngikutin SATU nada; pakai bagian solo, atau lagu yang sepi.",
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
