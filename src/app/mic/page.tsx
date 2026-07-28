"use client";

import Link from "next/link";
import { usePitch } from "@/lib/usePitch";
import { freqToNote } from "@/lib/notes";
import {
  DEFAULT_SENSITIVITY,
  sensitivityLabel,
  setSensitivity,
  useSensitivity,
} from "@/lib/micSettings";

// Halaman diagnosa: nunjukin ISI kepala detektor. Kalau app bilang "bukan nada
// biola", di sini keliatan ukuran mana yang gak lolos — jadi bisa dibenerin
// (geser mic, matiin kipas, geser sensitivitas) alih-alih nebak-nebak.

const REASON: Record<string, { label: string; fix: string }> = {
  ok: {
    label: "✅ Nada biola kebaca",
    fix: "Ini yang dipakai tuner, intonasi, dan mode lagu.",
  },
  calibrating: {
    label: "🎚️ Lagi ngukur suara ruangan",
    fix: "Sedetik pertama setelah mic nyala. Diem dulu, jangan gesek.",
  },
  quiet: {
    label: "🔇 Terlalu pelan",
    fix: "Belum ada suara yang cukup buat dianalisis. Gesek lebih mantap atau deketin mic ke biola.",
  },
  range: {
    label: "📏 Di luar jangkauan biola",
    fix: "Nada yang kebaca di bawah 188 Hz (di bawah senar G) atau di atas 3200 Hz. Biasanya ini suara ngomong, dengung listrik, atau ketokan.",
  },
  noise: {
    label: "🌫️ Spektrumnya rata (noise)",
    fix: "Suara desis/angin/gesekan kasar: energinya nyebar rata, gak ada puncak nada. Kalau ini muncul terus pas lu gesek, coba pelanin gesekan dan tambah rosin.",
  },
  inharmonic: {
    label: "🥁 Gak punya deret harmonik",
    fix: "Ada suara bernada tapi bukan dawai digesek (ketokan, klik, benturan). Dawai punya deret f0, 2f0, 3f0 — ini nggak.",
  },
  timbre: {
    label: "🗣️ Bernada, tapi bukan dawai",
    fix: "Harmoniknya ada, tapi tenaga terbesarnya di partial atas — ciri suara orang, TV, atau speaker. Dawai digesek selalu paling kuat di partial 1-2. Ini yang bikin suara ngomong gak lagi kebaca sebagai nada.",
  },
  unstable: {
    label: "🌊 Nadanya belum stabil",
    fix: "Nada baru mulai atau goyang terus. Tahan gesekan lebih lama — nada harus bertahan ~0,26 detik di frekuensi yang sama. Musik dari speaker biasanya mentok di sini karena nadanya ganti terus.",
  },
};

export default function MicPage() {
  const sensitivity = useSensitivity();
  const {
    freq,
    rawFreq,
    clarity,
    harmonic,
    timbre,
    harmonicCount,
    flatness,
    confidence,
    volumeDb,
    noiseFloorDb,
    peak,
    reason,
    active,
    error,
    start,
    stop,
  } = usePitch({ sensitivity });

  const info = REASON[reason] ?? REASON.quiet;
  const snr = Math.round(volumeDb - noiseFloorDb);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">🔬 Diagnosa Mic</h1>
        <p className="mt-1 text-sm text-muted">
          Isi kepala detektor, ditampilin apa adanya. Kalau app-nya gak mau
          baca nada lu, di sini keliatan ukuran mana yang gagal — jadi bisa
          dibenerin, bukan ditebak.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-border-soft bg-surface p-6 text-center">
        <div className="text-xs uppercase tracking-wide text-muted">
          Keputusan sekarang
        </div>
        <div className="mt-1 text-2xl font-bold text-accent-strong">
          {active ? info.label : "Mic mati"}
        </div>
        <div className="mx-auto mt-2 max-w-md text-xs text-muted">
          {active ? info.fix : "Nyalain mic, terus gesek satu senar panjang."}
        </div>

        {freq !== null && (
          <div className="mt-4">
            <div className="text-5xl font-bold text-good">
              {freqToNote(freq).name}
            </div>
            <div className="text-sm text-muted">
              {freq.toFixed(1)} Hz · keyakinan {Math.round(confidence * 100)}%
            </div>
          </div>
        )}

        <button
          onClick={active ? stop : start}
          className={`mt-5 rounded-full px-6 py-2.5 font-semibold transition-colors ${
            active
              ? "bg-surface-2 text-foreground hover:bg-border-soft"
              : "bg-accent text-background hover:bg-accent-strong"
          }`}
        >
          {active ? "■ Stop mic" : "🎤 Nyalain mic"}
        </button>
      </div>

      {/* Ukuran mentah */}
      <div className="space-y-3 rounded-xl border border-border-soft bg-surface p-5">
        <h2 className="text-sm font-semibold text-accent-strong">
          Ukuran mentah
        </h2>

        <Meter
          label="Volume masuk"
          value={volumeDb}
          min={-70}
          max={0}
          display={`${Math.round(volumeDb)} dB`}
          hint="Idealnya antara -35 dB dan -10 dB. Lebih dari -6 dB gampang pecah."
        />
        <Meter
          label="Suara latar ruangan"
          value={noiseFloorDb}
          min={-70}
          max={0}
          display={`${Math.round(noiseFloorDb)} dB`}
          hint={
            noiseFloorDb > -45
              ? "Ruangannya berisik. Matiin kipas/AC/TV kalau bisa."
              : "Ruangannya cukup sepi."
          }
          bad={noiseFloorDb > -45}
        />
        <Meter
          label="Jarak sinyal ke suara latar"
          value={snr}
          min={0}
          max={40}
          display={`${snr} dB`}
          hint="Makin besar makin gampang dibaca. Di bawah 6 dB susah."
          bad={snr < 6}
        />
        <Meter
          label="Kejernihan (periodisitas)"
          value={clarity}
          min={0}
          max={1}
          display={clarity.toFixed(2)}
          hint="Seberapa berulang gelombangnya. Dawai digesek ≥ 0,90; noise jauh di bawah."
          bad={clarity < 0.85}
        />
        <Meter
          label="Skor harmonik"
          value={harmonic}
          min={0}
          max={1}
          display={harmonic.toFixed(2)}
          hint="Porsi energi yang duduk di f0, 2f0, 3f0… Ciri khas dawai. Ketokan dan noise nilainya kecil."
          bad={harmonic < 0.3}
        />
        <Meter
          label="Timbre dawai (partial 1-2)"
          value={timbre}
          min={0}
          max={1}
          display={timbre.toFixed(2)}
          hint="Porsi tenaga harmonik di dua partial terbawah. Dawai tinggi (≥0,3); suara orang rendah karena formant narik tenaga ke partial atas."
          bad={timbre < 0.25}
        />
        <Meter
          label="Jumlah partial kebaca"
          value={harmonicCount}
          min={0}
          max={8}
          display={String(harmonicCount)}
          hint="Berapa deret harmonik yang nongol jelas. Dawai biasanya ≥4; kipas bernada dan siulan cuma 1-2."
          bad={harmonicCount < 3}
        />
        <Meter
          label="Kerataan spektrum"
          value={1 - flatness}
          min={0}
          max={1}
          display={flatness.toFixed(3)}
          hint="Makin KECIL angkanya makin bernada. Noise putih mendekati 1."
        />
        <Meter
          label="Puncak sinyal (clipping)"
          value={peak}
          min={0}
          max={1}
          display={peak.toFixed(2)}
          hint="Di atas 0,97 = pecah. Jauhin mic atau pelanin gesekan."
          bad={peak > 0.97}
        />
        {rawFreq > 0 && freq === null && (
          <p className="rounded-lg bg-surface-2 p-3 text-xs text-muted">
            Kandidat nada mentah: <b>{rawFreq.toFixed(1)} Hz</b> — ditolak
            saringan di atas. Ini normal buat suara selain biola.
          </p>
        )}
      </div>

      {/* Sensitivitas */}
      <div className="rounded-xl border border-border-soft bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">
              🎚️ Sensitivitas: {sensitivityLabel(sensitivity)}
            </div>
            <div className="mt-0.5 max-w-md text-xs text-muted">
              Kiri = lebih galak nolak (ruangan berisik). Kanan = lebih gampang
              nerima (mic laptop lemah, gesekan pelan). Setelan ini kepakai di
              semua halaman.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(sensitivity * 100)}
              onChange={(e) => setSensitivity(Number(e.target.value) / 100)}
              className="w-40 accent-[var(--accent)]"
              aria-label="Sensitivitas mic"
            />
            {sensitivity !== DEFAULT_SENSITIVITY && (
              <button
                onClick={() => setSensitivity(DEFAULT_SENSITIVITY)}
                className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted hover:text-foreground"
              >
                normal
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Penjelasan cara kerjanya */}
      <div className="space-y-3 rounded-xl border border-border-soft bg-surface p-5 text-xs text-muted">
        <h2 className="text-sm font-semibold text-accent-strong">
          Cara app ini mutusin &quot;ini biola apa bukan&quot;
        </h2>
        <p>
          Algoritma pencari nada (MPM/autokorelasi) itu <b>selalu</b> ngasih
          jawaban — dikasih suara kipas pun dia ngasih angka. Makanya jawabannya
          diuji ulang lewat 5 lapis:
        </p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>
            <b className="text-foreground">Bandpass 165 Hz – 5 kHz</b> — gemuruh
            AC dan desis dibuang sebelum dianalisis.
          </li>
          <li>
            <b className="text-foreground">Ambang level</b> — suara terlalu
            pelan gak dianalisis sama sekali.
          </li>
          <li>
            <b className="text-foreground">Jangkauan</b> — nada di luar 180–3200
            Hz bukan biola.
          </li>
          <li>
            <b className="text-foreground">Deret harmonik</b> — dawai yang
            digesek numpuk energinya di f0, 2f0, 3f0… Ketokan, klik, dan desis
            nggak.
          </li>
          <li>
            <b className="text-foreground">Kestabilan</b> — nada harus bertahan
            ±0,2 detik di frekuensi yang sama. Ini yang bikin suara orang
            ngomong ketolak: nadanya meluncur terus.
          </li>
        </ol>
        <p>
          Diuji pakai sinyal buatan (biola, biola+kipas, biola+ngomong, noise
          putih, kipas, ketokan, klik metronom, musik dari speaker) di{" "}
          <code className="text-foreground">scripts/test-detector.mjs</code> —
          akurasi rata-rata 99% dari 27 kasus.
        </p>
        <p>
          Masih ngaco? Urutan ngecek:{" "}
          <b className="text-foreground">
            (1) suara latar di bawah -45 dB, (2) jarak sinyal ke latar di atas 10
            dB, (3) skor harmonik di atas 0,4 pas lu gesek
          </b>
          . Kalau ketiganya oke tapi masih ditolak, geser sensitivitas ke kanan.
        </p>
        <p>
          <Link href="/tuner" className="text-accent-strong underline">
            Balik ke tuner →
          </Link>
        </p>
      </div>
    </div>
  );
}

function Meter({
  label,
  value,
  min,
  max,
  display,
  hint,
  bad = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  display: string;
  hint: string;
  bad?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">{label}</span>
        <span
          className={`font-mono text-sm ${bad ? "text-bad" : "text-accent-strong"}`}
        >
          {display}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full transition-all ${bad ? "bg-bad" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-0.5 text-[11px] text-muted">{hint}</div>
    </div>
  );
}
