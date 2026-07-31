"use client";

// Lagu → Not Biola lewat AI, dari JUDULNYA — bukan dari audionya.
//
// Ini fitur yang berdiri sendiri, bukan tambahan di halaman transkrip, karena
// cara kerjanya berbeda sama sekali:
//   - Halaman transkrip MENDENGAR audio. Butuh lagunya diputar, hasilnya
//     bergantung pada kualitas rekaman, dan tidak tahu apa-apa soal lagunya.
//   - Halaman ini TIDAK mendengar apa pun. Modelnya diminta menuliskan melodi
//     dari pengetahuannya, lalu hasilnya digubah jadi bagian biola yang enak
//     dimainkan — nada dasar dipilihkan, wilayahnya dijaga, panjangnya diatur.
//
// Konsekuensinya juga berbeda dan harus dikatakan terus terang: yang ini bisa
// SALAH INGAT. Transkrip bisa keliru mendengar, tapi tidak akan mengarang lagu.

import { useCallback, useMemo, useRef, useState } from "react";
import Staff from "@/components/Staff";
import LabelSwitch from "@/components/LabelSwitch";
import AiSetup from "@/components/AiSetup";
import { askDirect, askProxy, useAiMeta } from "@/lib/aiSettings";
import { hasVault } from "@/lib/secureKey";
import { bacaGubahan, PROMPT_GUBAH, type Gubahan } from "@/lib/arrange";
import { labelFor, useLabelMode } from "@/lib/noteLabel";
import { MelodyPlayer } from "@/lib/melodyPlayer";
import { jalurJari, ringkasJalur } from "@/lib/fingering";
import { bowDirections, BOW_MARK } from "@/lib/dynamics";
import { saveCustomSong } from "@/lib/songs";

const TINGKAT = [
  { v: "pemula", label: "🌱 Pemula", detail: "posisi 1 saja, nada dasar gampang" },
  { v: "menengah", label: "🌿 Menengah", detail: "boleh sampai posisi 3" },
  { v: "bebas", label: "🔥 Bebas", detail: "ikut aslinya, boleh posisi tinggi" },
] as const;

export default function GubahPage() {
  const ai = useAiMeta();
  const labelMode = useLabelMode();
  const [showSetup, setShowSetup] = useState(false);
  // Key hasil buka brankas cuma hidup di memori halaman ini.
  const [sessionKey, setSessionKey] = useState<string | null>(null);

  const [judul, setJudul] = useState("");
  const [tingkat, setTingkat] = useState<(typeof TINGKAT)[number]["v"]>("pemula");
  // Dua jalan ke AI, dan yang kedua ada justru karena yang pertama tidak selalu
  // masuk akal buat orangnya — lihat komentar panjang di bawah.
  const [jalan, setJalan] = useState<"api" | "tempel">("tempel");
  const [tempelan, setTempelan] = useState("");
  const [tersalin, setTersalin] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasil, setHasil] = useState<Gubahan | null>(null);
  const [mainIdx, setMainIdx] = useState(-1);
  const [main, setMain] = useState(false);
  const player = useRef(new MelodyPlayer());

  const siap = !!ai.proxyUrl || !!sessionKey;

  const jalur = useMemo(
    () => (hasil ? jalurJari(hasil.not.map((n) => n.midi)) : []),
    [hasil]
  );
  const ringkas = useMemo(
    () => (jalur.length ? ringkasJalur(jalur) : null),
    [jalur]
  );
  const bowMarks = useMemo(
    () =>
      hasil ? bowDirections(hasil.not.length).map((d) => BOW_MARK[d]) : [],
    [hasil]
  );

  // Perintah lengkap yang siap ditempel ke chat AI mana pun.
  //
  // Jalur ini ada karena permintaan aslinya — "sambungkan ke langganan Claude
  // Pro biar tidak beli token lagi" — memang tidak bisa dipenuhi lewat API:
  // langganan Pro itu untuk claude.ai, dan API-nya produk terpisah dengan
  // tagihan sendiri. Tidak ada kunci yang bisa dipasang di sini.
  //
  // Tapi tujuannya tetap bisa dicapai, cuma jalannya berbeda: perintahnya
  // disalin, ditempel ke claude.ai yang sudah pakai langganan itu, jawabannya
  // disalin balik ke sini. Nol biaya tambahan, dan halaman ini tetap yang
  // mengurus bagian susahnya — penjarian, arah bow, partitur, pemutaran.
  const perintah = useMemo(() => {
    const nama = judul.trim() || "(tulis judul lagunya di sini)";
    const batas =
      tingkat === "pemula"
        ? "Wajib posisi 1 saja (G3 sampai B5), hindari nada di luar tanda mula."
        : tingkat === "menengah"
          ? "Boleh sampai posisi 3, tapi jangan lebih tinggi dari A5."
          : "Boleh mengikuti aslinya.";
    return `${PROMPT_GUBAH}\n\n---\nLagu: ${nama}\nTingkat pemain: ${tingkat}\n${batas}\nBalas HANYA JSON sesuai bentuk di atas.`;
  }, [judul, tingkat]);

  const salinPerintah = async () => {
    try {
      await navigator.clipboard.writeText(perintah);
      setTersalin(true);
      window.setTimeout(() => setTersalin(false), 2000);
    } catch {
      setError("Gagal nyalin. Blok manual aja teksnya terus copy.");
    }
  };

  const bacaTempelan = () => {
    setError(null);
    const g = bacaGubahan(tempelan);
    if (!g) {
      setError(
        "Yang ditempel gak kebaca jadi not. Pastiin yang lu copy itu bagian JSON-nya (yang diawali { dan diakhiri }), boleh sekalian sama tulisan lainnya."
      );
      return;
    }
    setHasil(g);
    setMainIdx(-1);
  };

  const buat = useCallback(async () => {
    const nama = judul.trim();
    if (!nama) {
      setError("Tulis dulu judul lagunya.");
      return;
    }
    if (!siap) {
      setShowSetup(true);
      return;
    }
    setSibuk(true);
    setError(null);
    setHasil(null);
    setMainIdx(-1);
    try {
      const permintaan =
        `Lagu: ${nama}\n` +
        `Tingkat pemain: ${tingkat}\n` +
        (tingkat === "pemula"
          ? "Wajib posisi 1 saja (G3 sampai B5), hindari nada di luar tanda mula.\n"
          : tingkat === "menengah"
            ? "Boleh sampai posisi 3, tapi jangan lebih tinggi dari A5.\n"
            : "Boleh mengikuti aslinya.\n") +
        "Balas HANYA JSON sesuai bentuk yang sudah ditentukan.";

      const messages = [{ role: "user" as const, content: permintaan }];
      const jawaban = ai.proxyUrl
        ? await askProxy(ai.proxyUrl, PROMPT_GUBAH, messages)
        : await askDirect(ai, sessionKey!, PROMPT_GUBAH, messages);

      const g = bacaGubahan(jawaban);
      if (!g) {
        setError(
          "Jawaban AI-nya gak bisa dibaca jadi not. Coba lagi, atau tulis judulnya lebih lengkap (pakai nama penyanyinya juga)."
        );
        return;
      }
      setHasil(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSibuk(false);
    }
  }, [judul, tingkat, siap, ai, sessionKey]);

  const putar = () => {
    if (!hasil) return;
    if (main) {
      player.current.stop();
      setMain(false);
      setMainIdx(-1);
      return;
    }
    setMain(true);
    player.current.play(
      hasil.not.map((n) => ({ midi: n.midi, beats: n.beats })),
      hasil.bpm,
      {
        onNote: setMainIdx,
        onEnd: () => {
          setMain(false);
          setMainIdx(-1);
        },
      }
    );
  };

  const simpan = () => {
    if (!hasil) return;
    saveCustomSong({
      id: `ai-${Date.now()}`,
      title: hasil.judul,
      desc: `Gubahan AI · ${hasil.nadaDasar}`,
      level: "Gubahan AI",
      phrases: [hasil.not.map((n) => ({ midi: n.midi, beats: n.beats }))],
    });
    setError(null);
  };

  return (
    <main className="page-in mx-auto max-w-4xl px-4 py-6">
      <h1 className="title-drift text-2xl font-bold">🪄 Gubah Lagu jadi Not Biola</h1>
      <p className="mt-1 text-sm text-muted">
        Ketik judul lagunya, nanti AI yang nulisin melodinya jadi partitur biola
        lengkap dengan penjarian dan arah bow. Gak perlu muter lagunya, gak
        perlu mic.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !sibuk && jalan === "api" && buat()}
          placeholder="mis. Bengawan Solo, atau Twinkle Twinkle"
          className="min-w-56 flex-1 rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
        />
        {jalan === "api" ? (
          <button
            onClick={buat}
            disabled={sibuk}
            className="press lift rounded-full bg-accent px-6 py-2.5 font-semibold text-background transition-colors hover:bg-accent-strong disabled:opacity-60"
          >
            {sibuk ? "✍️ Lagi digubah…" : "🪄 Gubah"}
          </button>
        ) : (
          <button
            onClick={salinPerintah}
            className="press lift rounded-full bg-accent px-6 py-2.5 font-semibold text-background transition-colors hover:bg-accent-strong"
          >
            {tersalin ? "✅ Kesalin!" : "📋 Salin perintah"}
          </button>
        )}
        <LabelSwitch />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(
          [
            {
              v: "tempel" as const,
              label: "📋 Lewat langganan Claude Pro",
              detail: "salin–tempel · nol biaya API",
            },
            {
              v: "api" as const,
              label: "🤖 Otomatis pakai API key",
              detail: "sekali klik · pakai kredit API",
            },
          ]
        ).map((m) => (
          <button
            key={m.v}
            onClick={() => setJalan(m.v)}
            className={`press rounded-xl border px-3 py-2 text-left text-xs transition ${
              jalan === m.v
                ? "border-accent bg-accent/10"
                : "border-border-soft hover:border-accent/50"
            }`}
          >
            <span className="block font-semibold">{m.label}</span>
            <span className="text-muted">{m.detail}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {TINGKAT.map((t) => (
          <button
            key={t.v}
            onClick={() => setTingkat(t.v)}
            className={`press rounded-xl border px-3 py-2 text-left text-xs transition ${
              tingkat === t.v
                ? "border-accent bg-accent/10"
                : "border-border-soft hover:border-accent/50"
            }`}
          >
            <span className="block font-semibold">{t.label}</span>
            <span className="text-muted">{t.detail}</span>
          </button>
        ))}
      </div>

      {jalan === "tempel" && (
        <div className="animate-fade-up mt-4 rounded-2xl border border-accent/40 bg-accent/5 p-4">
          <p className="text-sm font-semibold">
            Pakai langganan Claude Pro lu — tanpa API key, tanpa beli token
          </p>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-muted">
            <li>Tulis judul lagunya di atas, pilih tingkatnya.</li>
            <li>
              Pencet <b>Salin perintah</b>.
            </li>
            <li>
              Buka{" "}
              <a
                href="https://claude.ai/new"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-strong underline"
              >
                claude.ai
              </a>{" "}
              (yang udah login langganan lu), tempel, kirim.
            </li>
            <li>Salin balik jawabannya, tempel di kotak bawah ini.</li>
          </ol>
          <p className="mt-2 rounded-lg bg-surface p-2 text-[11px] text-muted">
            Kenapa harus manual: langganan Pro itu buat claude.ai, sedangkan API
            itu produk terpisah dengan tagihan sendiri — ga ada kunci langganan
            yang bisa dipasang di halaman web. Jadi jalannya lewat claude.ai
            langsung. Bagian susahnya tetap dikerjain di sini: penjarian, arah
            bow, partitur, sama pemutarannya.
          </p>

          <textarea
            value={tempelan}
            onChange={(e) => setTempelan(e.target.value)}
            rows={4}
            placeholder="Tempel jawaban dari Claude di sini…"
            className="mt-3 w-full rounded-xl border border-border-soft bg-surface p-3 font-mono text-xs outline-none focus:border-accent"
          />
          <button
            onClick={bacaTempelan}
            disabled={!tempelan.trim()}
            className="press mt-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-background disabled:opacity-50"
          >
            🎼 Jadikan partitur
          </button>
        </div>
      )}

      {jalan === "api" && !siap && (
        <div className="animate-fade-up mt-4 rounded-2xl border border-accent/40 bg-accent/5 p-4">
          <p className="text-sm font-semibold">Perlu disambungkan ke AI dulu</p>
          <p className="mt-1 text-xs text-muted">
            Jalur otomatis butuh salah satu: proxy yang lu deploy sendiri, atau
            API key yang disimpan terkunci di perangkat ini. Kalau gak mau
            keluar biaya API, pakai jalur salin–tempel di sebelah.
          </p>
          <button
            onClick={() => setShowSetup(true)}
            className="press mt-3 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-background"
          >
            ⚙️ Sambungkan
          </button>
        </div>
      )}

      {error && (
        <p className="animate-fade-up mt-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm">
          {error}
        </p>
      )}

      {sibuk && (
        <div className="shimmer mt-4 rounded-2xl border border-border-soft bg-surface p-6 text-center text-sm text-muted">
          Lagi nulis melodinya, milih nada dasar yang enak buat biola, terus
          ngatur penjariannya…
        </div>
      )}

      {hasil && (
        <div className="animate-fade-up mt-5 space-y-4">
          <div className="rounded-2xl border border-border-soft bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">{hasil.judul}</h2>
              <span className="text-xs text-muted">
                {hasil.nadaDasar} · {hasil.bpm} BPM · {hasil.ketukPerBirama}/4 ·{" "}
                {hasil.not.length} not
              </span>
            </div>
            {hasil.catatan && (
              <p className="mt-2 text-sm text-muted">{hasil.catatan}</p>
            )}
            {ringkas && (
              <p className="mt-2 text-xs text-muted">
                Penjarian: posisi tertinggi {ringkas.posisiTertinggi} ·{" "}
                {ringkas.jumlahGeser}× geser · {ringkas.senarKosong} senar kosong
              </p>
            )}
            <p className="mt-2 rounded-lg bg-surface-2 p-2 text-[11px] text-muted">
              ⚠️ Ini tulisan AI dari ingatannya, bukan hasil mendengar lagunya.
              Bisa meleset dari aslinya — cocokkan dulu sama lagunya sebelum
              dihafal.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={putar}
                className="press rounded-full bg-accent px-5 py-2 text-sm font-semibold text-background"
              >
                {main ? "⏹ Stop" : "▶️ Dengerin"}
              </button>
              <button
                onClick={simpan}
                className="press rounded-full border border-border-soft px-4 py-2 text-sm transition hover:border-accent"
              >
                💾 Simpan ke daftar lagu
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border-soft bg-surface p-3">
            <Staff
              notes={hasil.not}
              current={mainIdx}
              labels={hasil.not.map((n) => labelFor(n.midi, labelMode))}
              bowMarks={bowMarks}
              beatsPerBar={hasil.ketukPerBirama}
            />
          </div>

          {jalur.length > 0 && (
            <div className="rounded-2xl border border-border-soft bg-surface p-4">
              <h3 className="text-sm font-semibold">Penjarian</h3>
              <div className="mt-2 flex flex-wrap gap-1">
                {jalur.map((p, i) => (
                  <span
                    key={i}
                    className={`rounded-lg border px-2 py-1 text-[11px] ${
                      i === mainIdx
                        ? "border-accent bg-accent/15 font-semibold"
                        : "border-border-soft"
                    }`}
                  >
                    {labelFor(p.midi, labelMode)}{" "}
                    <span className="text-muted">
                      {p.senar}
                      {p.jari === 0 ? "0" : p.jari}
                      {p.posisi > 1 ? `/p${p.posisi}` : ""}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {hasil.peringatan.map((p, i) => (
            <p key={i} className="text-xs text-muted">
              · {p}
            </p>
          ))}
        </div>
      )}

      {showSetup && (
        <AiSetup
          onClose={() => setShowSetup(false)}
          onUnlocked={(k) => setSessionKey(k)}
          unlocked={!!sessionKey || hasVault()}
        />
      )}
    </main>
  );
}
