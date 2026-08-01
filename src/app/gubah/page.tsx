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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [jalan, setJalan] = useState<"lokal" | "api" | "tempel">("lokal");
  // Apakah jembatan Claude Code lokal sedang hidup. null = belum diperiksa.
  const [jembatan, setJembatan] = useState<boolean | null>(null);
  const [tempelan, setTempelan] = useState("");
  const [tersalin, setTersalin] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasil, setHasil] = useState<Gubahan | null>(null);
  const [mainIdx, setMainIdx] = useState(-1);
  const [main, setMain] = useState(false);
  const player = useRef(new MelodyPlayer());

  const siap = !!ai.proxyUrl || !!sessionKey;

  // Alamat jembatan lokal. 127.0.0.1, bukan localhost: sebagian browser
  // menerjemahkan localhost ke ::1 lebih dulu, dan servernya cuma mendengar di
  // IPv4 — gejalanya "gagal fetch" padahal jembatannya hidup.
  const ALAMAT_LOKAL = "http://127.0.0.1:8787";

  // Diperiksa saat halaman dibuka supaya orangnya tidak perlu menebak apakah
  // jembatannya sudah jalan atau belum.
  useEffect(() => {
    let batal = false;
    fetch(ALAMAT_LOKAL, { method: "GET" })
      .then((r) => r.ok)
      .then((ok) => !batal && setJembatan(ok))
      .catch(() => !batal && setJembatan(false));
    return () => {
      batal = true;
    };
  }, []);

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

  const bacaTempelan = useCallback(
    (teks: string) => {
      const isi = teks.trim();
      if (!isi) return;

      // Perintahnya sendiri ditempel balik ke sini. Ini bukan kasus aneh —
      // orangnya baru saja menyalin perintah itu, jadi isi papan salinnya
      // memang itu, dan kotak tempelan ada tepat di bawah tombol salin.
      // Pesannya harus menyebut persis apa yang terjadi, bukan "gak kebaca".
      if (/Kamu penata musik untuk biola|Balas HANYA JSON/i.test(isi)) {
        setError(
          "Itu PERINTAHNYA yang kebalik ketempel — bukan jawabannya. Alurnya: perintah tadi ditempel dulu di claude.ai, dikirim, baru BALASAN Claude yang lu copy ke sini."
        );
        return;
      }

      // Kesalahan yang paling sering terjadi, dan memang salah rancangan awal:
      // judul lagunya diketik di kotak tempelan, bukan di kotak judul. Dua
      // kotak teks tanpa pembeda yang jelas memang menjebak. Jadi kalau yang
      // masuk kelihatan seperti judul — pendek dan tanpa kurung kurawal —
      // orangnya diberi tahu persis harus ke mana, bukan disuruh menebak.
      if (!isi.includes("{")) {
        if (isi.length < 80) {
          setError(
            `"${isi.slice(0, 40)}" kayaknya judul lagu, bukan jawaban Claude. Judulnya ditulis di kotak paling atas ya — kotak ini buat nempel balasan dari claude.ai.`
          );
          // Sekalian dipindahkan, biar tidak perlu mengetik ulang.
          if (!judul.trim()) setJudul(isi);
          return;
        }
        setError(
          "Gak nemu JSON di situ. Yang perlu di-copy dari Claude itu bagian yang diawali { dan diakhiri } — boleh sekalian sama tulisan di sekitarnya."
        );
        return;
      }

      const g = bacaGubahan(isi);
      if (!g) {
        setError(
          "JSON-nya kebaca tapi isinya gak nyambung jadi not. Coba minta Claude balas ULANG cuma JSON-nya aja, tanpa penjelasan."
        );
        return;
      }
      setError(null);
      setHasil(g);
      setMainIdx(-1);
    },
    [judul]
  );


  const buat = useCallback(async () => {
    const nama = judul.trim();
    if (!nama) {
      setError("Tulis dulu judul lagunya.");
      return;
    }
    if (jalan === "api" && !siap) {
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
      const jawaban =
        jalan === "lokal"
          ? await askProxy(ALAMAT_LOKAL, PROMPT_GUBAH, messages)
          : ai.proxyUrl
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
      const pesan = e instanceof Error ? e.message : String(e);
      // "Failed to fetch" itu pesan browser yang tidak berarti apa-apa buat
      // penggunanya. Di mode lokal, sebabnya hampir selalu satu: jembatannya
      // belum dijalankan.
      setError(
        jalan === "lokal" && /failed to fetch|networkerror|load failed/i.test(pesan)
          ? "Jembatannya belum jalan. Buka terminal di folder app-nya, jalankan: node bridge/claude-lokal.mjs"
          : pesan
      );
      if (jalan === "lokal") setJembatan(false);
    } finally {
      setSibuk(false);
    }
  }, [judul, tingkat, siap, ai, sessionKey, jalan]);

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

      <label className="mt-4 block text-xs font-semibold text-accent-strong">
        1️⃣ Judul lagunya
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !sibuk && jalan === "api" && buat()}
          placeholder="mis. Bengawan Solo, atau Twinkle Twinkle"
          className="min-w-56 flex-1 rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
        />
        {(jalan === "api" || jalan === "lokal") && (
          <button
            onClick={buat}
            disabled={sibuk}
            className="tekan-pegas angkat rounded-full bg-accent px-6 py-2.5 font-semibold text-background transition-colors hover:bg-accent-strong disabled:opacity-60"
          >
            {sibuk ? "✍️ Lagi digubah…" : "🪄 Gubah"}
          </button>
        )}
        <LabelSwitch />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(
          [
            {
              v: "lokal" as const,
              label: "⚡ Claude Code lokal (langganan lu)",
              detail:
                jembatan === true
                  ? "jembatan hidup · sekali klik · nol biaya"
                  : jembatan === false
                    ? "jembatan belum jalan — lihat di bawah"
                    : "sekali klik · nol biaya API",
            },
            {
              v: "tempel" as const,
              label: "📋 Salin–tempel manual",
              detail: "kalau ga mau jalanin apa-apa",
            },
            {
              v: "api" as const,
              label: "🤖 API key",
              detail: "pakai kredit API",
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

      {jalan === "lokal" && (
        <div className="animate-fade-up mt-4 rounded-2xl border border-accent/40 bg-accent/5 p-4">
          <p className="text-sm font-semibold">
            {jembatan === true
              ? "✅ Jembatan hidup — tinggal pencet Gubah"
              : "⚡ Pakai langganan Claude lu, tanpa API key"}
          </p>
          {jembatan !== true && (
            <>
              <p className="mt-1 text-xs text-muted">
                Claude Code jalan pakai langganan lu. Jadi yang dijembatani
                bukan langganannya, tapi Claude Code-nya: app manggil server
                kecil di komputer lu, server itu manggil Claude Code. Nol kunci
                API, nol beli token.
              </p>
              <p className="mt-2 text-xs font-semibold">Sekali doang, siapin:</p>
              <ol className="mt-1 list-inside list-decimal space-y-1 text-xs text-muted">
                <li>
                  Login Claude Code: buka terminal, ketik <code>claude</code>,
                  terus ketik <code>/login</code>.
                </li>
                <li>
                  Jalanin jembatannya:
                  <code className="mt-1 block rounded bg-surface-2 p-2 font-mono text-[11px]">
                    node bridge/claude-lokal.mjs
                  </code>
                </li>
                <li>Balik ke sini, pencet Gubah. Biarin terminalnya kebuka.</li>
              </ol>
            </>
          )}
          {jembatan === true && (
            <p className="mt-1 text-xs text-muted">
              Kalau pas dipencet muncul &quot;belum login&quot;: buka terminal,
              ketik <code>claude</code>, lalu <code>/login</code>. Sekali doang.
            </p>
          )}
          {/* Selalu kelihatan, bukan cuma waktu pemasangan: ini menyangkut
              siapa saja yang bisa memakai langganannya. */}
          <p className="mt-2 rounded-lg bg-surface p-2 text-[11px] text-muted">
            🔒 Jembatannya cuma dengerin 127.0.0.1 (ga bisa dijangkau dari
            jaringan) dan cuma nerima panggilan dari alamat app ini. Situs lain
            yang kebetulan lu buka ga bisa nebeng langganan lu.
          </p>
        </div>
      )}

      {jalan === "tempel" && (
        <div className="animate-fade-up mt-4 rounded-2xl border border-accent/40 bg-accent/5 p-4">
          <p className="text-sm font-semibold">
            Pakai langganan Claude Pro lu — tanpa API key, tanpa beli token
          </p>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-muted">
            <li>
              Tulis judul lagunya di <b>kotak paling atas</b>, pilih tingkatnya.
            </li>
            <li>
              Pencet tombol di bawah ini — perintahnya kesalin dan claude.ai
              kebuka sekalian.
            </li>
            <li>Di claude.ai: tempel (Ctrl+V), kirim.</li>
            <li>Salin balik jawabannya, tempel di kotak bawah. Langsung jadi.</li>
          </ol>

          {/* Tidak membuka tab sendiri. Tab yang tiba-tiba melompat itu
              mengagetkan dan terasa seperti halaman kehilangan kendali. */}
          <button
            onClick={salinPerintah}
            disabled={!judul.trim()}
            className="tekan-pegas angkat mt-3 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
          >
            {tersalin ? "✅ Kesalin — tempel di claude.ai" : "📋 Salin perintah"}
          </button>
          {!judul.trim() && (
            <p className="mt-1 text-[11px] text-bad">
              Isi dulu judul lagunya di kotak paling atas.
            </p>
          )}
          <p className="mt-2 rounded-lg bg-surface p-2 text-[11px] text-muted">
            Kenapa harus manual: langganan Pro itu buat claude.ai, sedangkan API
            itu produk terpisah dengan tagihan sendiri — ga ada kunci langganan
            yang bisa dipasang di halaman web. Jadi jalannya lewat claude.ai
            langsung. Bagian susahnya tetap dikerjain di sini: penjarian, arah
            bow, partitur, sama pemutarannya.
          </p>

          <div className="mt-3 rounded-xl border border-border-soft bg-surface p-3">
            <label className="block text-xs font-semibold">
              ⬇️ Kotak ini buat NEMPEL BALASAN CLAUDE
              <span className="ml-1 font-normal text-muted">
                — bukan judul lagu. Judulnya di kotak paling atas.
              </span>
            </label>
            <textarea
              value={tempelan}
              onChange={(e) => {
                setTempelan(e.target.value);
                // Langsung dibaca begitu ditempel — tidak perlu pencet tombol
                // lagi. Tombolnya tetap ada buat yang mengetik manual.
                if (e.target.value.includes("{")) bacaTempelan(e.target.value);
              }}
              onPaste={(e) => {
                const teks = e.clipboardData.getData("text");
                if (teks) {
                  e.preventDefault();
                  setTempelan(teks);
                  bacaTempelan(teks);
                }
              }}
              rows={4}
              placeholder='Tempel di sini, contoh: {"judul":"...","not":[...]}'
              className="mt-2 w-full rounded-lg border border-border-soft bg-background p-3 font-mono text-xs outline-none focus:border-accent"
            />
            <button
              onClick={() => bacaTempelan(tempelan)}
              disabled={!tempelan.trim()}
              className="tekan-pegas mt-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-background disabled:opacity-50"
            >
              🎼 Jadikan partitur
            </button>
          </div>
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
