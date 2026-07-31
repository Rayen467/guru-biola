"use client";

// Saran jari, senar, dan posisi untuk sederet nada.
//
// Kenapa ini perlu ada terpisah dari label nada yang sudah dipakai di halaman
// lain: label itu cuma tahu posisi 1 dan menyerah di atasnya. Begitu melodinya
// naik sedikit, muridnya ditinggal tanpa petunjuk apa pun. Halaman ini
// menghitung seluruh jalur tangan sampai posisi 7, termasuk memberi tahu DI MANA
// tangannya harus geser — bagian yang paling sering bikin nada meleset.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SONGS, loadCustomSongs, type Song } from "@/lib/songs";
import { jalurJari, geseran, ringkasJalur, type Pilihan } from "@/lib/fingering";
import { labelFor, useLabelMode } from "@/lib/noteLabel";
import LabelSwitch from "@/components/LabelSwitch";
import { MelodyPlayer } from "@/lib/melodyPlayer";
import AnalysisCard, { type Analysis } from "@/components/AnalysisCard";

const NAMA = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Warna per posisi supaya blok posisi kelihatan sebagai blok, bukan angka yang
// harus dibaca satu-satu.
const WARNA_POSISI = [
  "bg-accent/15 border-accent/40",
  "bg-good/15 border-good/40",
  "bg-amber-500/15 border-amber-500/40",
  "bg-fuchsia-500/15 border-fuchsia-500/40",
  "bg-sky-500/15 border-sky-500/40",
];
const warnaPosisi = (p: number) => WARNA_POSISI[(p - 1) % WARNA_POSISI.length];

// Mengubah tulisan huruf jadi nada. Ditulis longgar sengaja: murid mengetik
// "a b c# d" atau "A4 B4 C#5", dua-duanya harus jalan.
function bacaNada(teks: string): number[] {
  const hasil: number[] = [];
  let oktafTerakhir = 4;
  for (const potong of teks.split(/[\s,|]+/).filter(Boolean)) {
    const m = /^([a-gA-G])([#b]?)(\d?)$/.exec(potong.trim());
    if (!m) continue;
    let kelas = NAMA.indexOf(m[1].toUpperCase());
    if (kelas < 0) continue;
    if (m[2] === "#") kelas += 1;
    if (m[2] === "b") kelas -= 1;

    if (m[3]) {
      const oktaf = Number(m[3]);
      oktafTerakhir = oktaf;
      hasil.push((oktaf + 1) * 12 + kelas);
      continue;
    }

    // Tanpa angka oktaf, dipilih oktaf yang paling DEKAT ke nada sebelumnya.
    //
    // Kalau oktafnya sekadar diwarisi apa adanya, tangga nada yang diketik
    // "G A B C D E F# G" jadi patah di C: C-nya jatuh satu oktaf di bawah B,
    // melodinya terjun, dan penjariannya ikut ngaco ke senar G. Padahal yang
    // dimaksud jelas naik terus. Memilih yang terdekat membereskan naik maupun
    // turun tanpa perlu menulis angka apa pun.
    const sebelum = hasil[hasil.length - 1];
    if (sebelum === undefined) {
      hasil.push((oktafTerakhir + 1) * 12 + kelas);
      continue;
    }
    let terbaik = (oktafTerakhir + 1) * 12 + kelas;
    for (let o = 0; o <= 8; o++) {
      const calon = (o + 1) * 12 + kelas;
      if (Math.abs(calon - sebelum) < Math.abs(terbaik - sebelum)) terbaik = calon;
    }
    oktafTerakhir = Math.floor(terbaik / 12) - 1;
    hasil.push(terbaik);
  }
  return hasil;
}

function nilaiJalur(jalur: Pilihan[]): Analysis {
  const r = ringkasJalur(jalur);
  // Nilai di sini bukan nilai permainan — belum ada yang digesek. Ini ukuran
  // seberapa berat frasa ini untuk tangan, biar murid tahu harus siap apa.
  let score = 100;
  score -= r.jumlahGeser * 9;
  score -= Math.max(0, r.posisiTertinggi - 1) * 7;
  score -= r.regang * 6;
  score += Math.min(10, r.senarKosong * 2);
  score = Math.max(5, Math.min(100, Math.round(score)));

  const verdicts: Analysis["verdicts"] = [];
  verdicts.push(
    r.jumlahGeser === 0
      ? {
          icon: "✋",
          title: "Tangan diam di tempat",
          detail: "Tidak ada geser posisi sama sekali. Tinggal fokus ke jari dan gesekan.",
          tone: "good",
        }
      : {
          icon: "↔️",
          title: `${r.jumlahGeser}× geser posisi`,
          detail:
            "Latih bagian geseran saja dulu, pelan-pelan, sampai tangan hafal jaraknya. Ini sumber fals paling umum.",
          tone: r.jumlahGeser > 2 ? "warn" : "good",
        }
  );
  verdicts.push(
    r.posisiTertinggi === 1
      ? {
          icon: "1️⃣",
          title: "Posisi 1 semua",
          detail: "Seluruh frasa muat di posisi dasar.",
          tone: "good",
        }
      : {
          icon: "🖐️",
          title: `Sampai posisi ${r.posisiTertinggi}`,
          detail: `Tangan naik ke posisi ${r.posisiTertinggi}. Cek dulu patokan rabanya sebelum main cepat.`,
          tone: r.posisiTertinggi >= 4 ? "warn" : "good",
        }
  );
  if (r.regang > 0) {
    verdicts.push({
      icon: "🤏",
      title: `${r.regang} nada perlu jari direntang`,
      detail:
        "Jari 4 direntangkan atau jari 1 ditarik mundur. Jangan tarik seluruh tangan — cukup jarinya.",
      tone: "warn",
    });
  }
  if (r.senarKosong > 0) {
    verdicts.push({
      icon: "🎻",
      title: `${r.senarKosong} senar kosong`,
      detail:
        "Senar kosong paling gampang dan paling nyaring. Pastikan bow-nya tidak menyenggol senar sebelah.",
      tone: "good",
    });
  }
  return {
    score,
    headline:
      r.jumlahGeser === 0 && r.posisiTertinggi === 1
        ? "Frasa ini ringan"
        : r.jumlahGeser <= 2
          ? "Sedang — ada bagian yang perlu disiapkan"
          : "Berat — banyak perpindahan tangan",
    subline: `${jalur.length} nada · posisi tertinggi ${r.posisiTertinggi} · ${r.jumlahGeser} geseran`,
    verdicts,
  };
}

export default function JariPage() {
  const [sumber, setSumber] = useState<"lagu" | "ketik">("lagu");
  const [lagu, setLagu] = useState<Song | null>(null);
  const [teks, setTeks] = useState("A B C# D E D C# A");
  const [main, setMain] = useState(false);
  const [aktif, setAktif] = useState(-1);
  const [custom, setCustom] = useState<Song[]>([]);
  const player = useRef(new MelodyPlayer());
  const labelMode = useLabelMode();

  useEffect(() => {
    setCustom(loadCustomSongs());
    setLagu(SONGS[0] ?? null);
    const p = player.current;
    return () => p.stop();
  }, []);

  const midis = useMemo(() => {
    if (sumber === "ketik") return bacaNada(teks);
    if (!lagu) return [];
    return lagu.phrases.flat().map((n) => n.midi);
  }, [sumber, teks, lagu]);

  const jalur = useMemo(() => jalurJari(midis), [midis]);
  const gsr = useMemo(() => geseran(jalur), [jalur]);
  const analysis = useMemo(
    () => (jalur.length > 0 ? nilaiJalur(jalur) : null),
    [jalur]
  );
  // Not ke berapa saja yang jadi titik geser — dipakai buat menandai di daftar.
  const titikGeser = useMemo(() => new Set(gsr.map((g) => g.ke)), [gsr]);

  const putar = useCallback(() => {
    if (main) {
      player.current.stop();
      setMain(false);
      setAktif(-1);
      return;
    }
    setMain(true);
    player.current.play(
      jalur.map((p) => ({ midi: p.midi, beats: 1 })),
      92,
      {
        onNote: setAktif,
        onEnd: () => {
          setMain(false);
          setAktif(-1);
        },
      }
    );
  }, [main, jalur]);

  const semuaLagu = [...SONGS, ...custom];

  return (
    <main className="page-in mx-auto max-w-5xl px-4 py-6">
      <h1 className="title-drift text-2xl font-bold">🖐️ Saran Jari & Posisi</h1>
      <p className="mt-1 text-sm text-muted">
        Kasih deretan nada, nanti dihitung jari, senar, dan posisi mana yang
        paling enteng buat tangan — termasuk di mana tangannya harus geser.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(
          [
            { v: "lagu", label: "📚 Dari daftar lagu" },
            { v: "ketik", label: "⌨️ Ketik sendiri" },
          ] as const
        ).map((m) => (
          <button
            key={m.v}
            onClick={() => setSumber(m.v)}
            className={`press rounded-full border px-3 py-1.5 text-sm transition ${
              sumber === m.v
                ? "border-accent bg-accent/15 text-accent-strong"
                : "border-border-soft text-muted hover:border-accent/50"
            }`}
          >
            {m.label}
          </button>
        ))}
        <div className="ml-auto">
          <LabelSwitch />
        </div>
      </div>

      {sumber === "lagu" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {semuaLagu.map((s) => (
            <button
              key={s.id}
              onClick={() => setLagu(s)}
              className={`press rounded-xl border px-3 py-2 text-left text-xs transition ${
                lagu?.id === s.id
                  ? "border-accent bg-accent/10"
                  : "border-border-soft hover:border-accent/50"
              }`}
            >
              <span className="block font-semibold">{s.title}</span>
              <span className="text-muted">{s.level}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <textarea
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-border-soft bg-surface p-3 font-mono text-sm outline-none focus:border-accent"
            placeholder="A B C# D E   atau   A4 B4 C#5 D5 E5"
          />
          <p className="mt-1 text-xs text-muted">
            Huruf saja boleh (oktafnya ngikut nada sebelumnya). Pakai # buat
            kres, b buat mol. Angka di belakang = oktaf, misal A4 itu senar A
            kosong.
          </p>
        </div>
      )}

      {jalur.length === 0 ? (
        <p className="mt-6 rounded-xl border border-border-soft bg-surface p-4 text-sm text-muted">
          Belum ada nada yang kebaca. Cek tulisannya — contoh yang benar:{" "}
          <span className="font-mono">A B C# D</span>
        </p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={putar}
              className="press lift rounded-full bg-accent px-5 py-2.5 font-semibold text-background transition-colors hover:bg-accent-strong"
            >
              {main ? "⏹ Stop" : "▶️ Dengerin"}
            </button>
            <span className="text-xs text-muted">
              Blok warna = satu posisi tangan. Ganti warna artinya tangan geser.
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {jalur.map((p, i) => (
              <div
                key={i}
                className={`animate-pop relative rounded-xl border px-2.5 py-2 text-center transition ${warnaPosisi(
                  p.posisi
                )} ${aktif === i ? "note-live scale-110" : ""}`}
                style={{ animationDelay: `${Math.min(i * 22, 600)}ms` }}
              >
                {titikGeser.has(i) && (
                  <span
                    className="animate-wiggle absolute -top-2 -right-1 text-xs"
                    title="di sini tangan geser"
                  >
                    ↔️
                  </span>
                )}
                <div className="text-base font-bold leading-tight">
                  {labelFor(p.midi, labelMode)}
                </div>
                <div className="text-[11px] leading-tight text-muted">
                  {p.senar}
                  {p.jari === 0 ? " kosong" : ` · jari ${p.jari}`}
                </div>
                <div className="text-[10px] leading-tight text-muted">
                  posisi {p.posisi}
                  {p.regang && <span className="text-bad"> · regang</span>}
                </div>
              </div>
            ))}
          </div>

          {gsr.length > 0 && (
            <div className="animate-fade-up mt-5 rounded-2xl border border-border-soft bg-surface p-4">
              <h2 className="text-sm font-semibold">
                ↔️ Titik geser — latih bagian ini duluan
              </h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                {gsr.map((g, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs">
                      not ke-{g.ke + 1}
                    </span>
                    <span>
                      posisi {g.dari} → {g.tujuan} di senar {jalur[g.ke].senar},
                      mendarat pakai jari {jalur[g.ke].jari}
                    </span>
                    <span className="font-bold">
                      {labelFor(jalur[g.ke].midi, labelMode)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                Cara latihnya: mainkan nada sebelum geseran, lalu geser sambil
                jari tetap menempel ringan di senar, berhenti, cek nadanya pakai
                tuner. Ulang sampai tangannya hafal jaraknya tanpa dicek.
              </p>
            </div>
          )}

          <div className="mt-5">
            <AnalysisCard analysis={analysis} />
          </div>
        </>
      )}
    </main>
  );
}
