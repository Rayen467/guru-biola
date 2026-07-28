"use client";

// Panel setelan Guru AI untuk versi online.
//
// Prinsip yang dipegang di sini:
//   - Key TIDAK PERNAH ditampilkan lagi setelah disimpan, dan tidak pernah
//     ditulis apa adanya ke penyimpanan.
//   - Mode yang paling aman ditaruh paling atas dan jadi bawaan.
//   - Peringatan panjang disembunyikan di balik "kenapa begini?" — yang perlu
//     dilihat sehari-hari cuma status: terkunci / kebuka.

import { useEffect, useState } from "react";
import {
  AI_PRESETS,
  getAiMeta,
  notifyAiChange,
  setAiMeta,
  type AiMeta,
} from "@/lib/aiSettings";
import {
  clearVault,
  findLegacyPlainKey,
  hasVault,
  purgeLegacyPlainKey,
  saveEncryptedKey,
  unlockKey,
} from "@/lib/secureKey";

export default function AiSetup({
  onClose,
  onUnlocked,
  unlocked,
}: {
  onClose: () => void;
  onUnlocked: (key: string | null) => void;
  unlocked: boolean;
}) {
  const [meta, setMeta] = useState<AiMeta>({ baseUrl: "", model: "", proxyUrl: "" });
  const [mode, setMode] = useState<"proxy" | "key">("proxy");
  const [apiKey, setApiKey] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [vault, setVault] = useState(false);
  const [why, setWhy] = useState(false);
  const [legacy, setLegacy] = useState(false);

  useEffect(() => {
    const m = getAiMeta();
    setMeta(m);
    setVault(hasVault());
    setMode(m.proxyUrl ? "proxy" : hasVault() ? "key" : "proxy");
    // Versi lama menyimpan key apa adanya. Kalau ketemu, langsung dibuang dan
    // pemiliknya diberi tahu — jangan dibiarkan nganggur di penyimpanan.
    const old = findLegacyPlainKey();
    if (old) {
      purgeLegacyPlainKey();
      setLegacy(true);
      setMeta((cur) => ({ ...cur, baseUrl: old.baseUrl || cur.baseUrl, model: old.model || cur.model }));
    }
  }, []);

  const preset = AI_PRESETS.find((p) => p.baseUrl === meta.baseUrl);

  const simpanProxy = () => {
    setAiMeta({ ...meta, proxyUrl: meta.proxyUrl.trim() });
    setMsg({ ok: true, text: "Alamat proxy tersimpan. Gak ada key di perangkat ini." });
  };

  const simpanKey = async () => {
    if (!apiKey.trim()) return setMsg({ ok: false, text: "Key belum diisi." });
    if (pass.length < 6)
      return setMsg({ ok: false, text: "Kata sandi minimal 6 karakter." });
    if (pass !== pass2) return setMsg({ ok: false, text: "Kata sandi gak sama." });
    setBusy(true);
    try {
      await saveEncryptedKey(apiKey.trim(), pass, {
        baseUrl: meta.baseUrl,
        model: meta.model,
      });
      setAiMeta({ ...meta, proxyUrl: "" });
      // Bersihin dari memori form secepatnya.
      setApiKey("");
      setPass("");
      setPass2("");
      setVault(true);
      onUnlocked(null);
      setMsg({ ok: true, text: "Key tersimpan terenkripsi. Buka pakai kata sandi tiap mulai." });
    } catch (e) {
      setMsg({ ok: false, text: "Gagal menyimpan: " + String(e) });
    } finally {
      setBusy(false);
      notifyAiChange();
    }
  };

  const buka = async () => {
    setBusy(true);
    try {
      const k = await unlockKey(pass);
      setPass("");
      onUnlocked(k);
      setMsg({ ok: true, text: "Kebuka. Berlaku sampai halaman ini ditutup." });
    } catch (e) {
      onUnlocked(null);
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-up mb-4 space-y-3 rounded-xl border border-accent/40 bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-accent-strong">
          Setelan Guru AI
        </h2>
        <button
          onClick={onClose}
          className="press rounded-full px-2 py-1 text-xs text-muted hover:text-foreground"
        >
          ✕
        </button>
      </div>

      {legacy && (
        <p className="animate-wiggle rounded-lg border border-bad/40 bg-bad/10 p-2.5 text-xs">
          Key lama yang kesimpen polos udah <b>dihapus otomatis</b> dari
          perangkat ini. Simpan ulang pakai salah satu cara di bawah.
        </p>
      )}

      <p className="text-xs text-muted">
        Di komputer yang jalanin app-nya sendiri, gak perlu ngisi apa-apa —
        key dibaca dari <code>.env.local</code> dan gak pernah nyampe browser.
        Setelan ini cuma buat versi online.
      </p>

      <div className="flex gap-2">
        {(
          [
            { v: "proxy" as const, label: "🛡️ Proxy (paling aman)" },
            { v: "key" as const, label: "🔐 Key terenkripsi" },
          ]
        ).map((m) => (
          <button
            key={m.v}
            onClick={() => setMode(m.v)}
            className={`press flex-1 rounded-lg px-3 py-2 text-xs ${
              mode === m.v
                ? "bg-accent font-semibold text-background"
                : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "proxy" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            Key duduk di penerus milik lu sendiri, browser cuma tahu alamatnya.
            Gak ada rahasia apa pun di HP. Templat penerusnya udah ada di repo:{" "}
            <code>proxy/cloudflare-worker.js</code> (gratis, ±5 menit pasang).
          </p>
          <input
            value={meta.proxyUrl}
            onChange={(e) => setMeta({ ...meta, proxyUrl: e.target.value })}
            placeholder="https://guru-biola.namalu.workers.dev"
            className="w-full rounded-lg bg-surface-2 px-3 py-2 text-sm"
          />
          <button
            onClick={simpanProxy}
            className="press rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-background hover:bg-accent-strong"
          >
            Simpan alamat proxy
          </button>
        </div>
      ) : vault ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            Key tersimpan <b>terenkripsi</b> di perangkat ini. Masukin kata
            sandinya buat pakai — berlaku sampai halaman ditutup.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buka()}
              placeholder="kata sandi"
              className="flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm"
            />
            <button
              onClick={buka}
              disabled={busy}
              className="press rounded-full bg-accent px-4 py-2 text-xs font-semibold text-background disabled:opacity-50"
            >
              {unlocked ? "Kebuka ✓" : "Buka"}
            </button>
          </div>
          <button
            onClick={() => {
              clearVault();
              setVault(false);
              onUnlocked(null);
              setMsg({ ok: true, text: "Key dihapus dari perangkat ini." });
              notifyAiChange();
            }}
            className="press text-xs text-muted underline-offset-2 hover:underline"
          >
            hapus key dari perangkat ini
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {AI_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setMeta({ ...meta, baseUrl: p.baseUrl, model: p.model })}
                className={`press rounded-full px-3 py-1.5 text-xs ${
                  preset?.id === p.id
                    ? "bg-accent font-semibold text-background"
                    : "bg-surface-2 text-muted hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <input
            value={meta.baseUrl}
            onChange={(e) => setMeta({ ...meta, baseUrl: e.target.value })}
            placeholder="alamat API"
            className="w-full rounded-lg bg-surface-2 px-3 py-2 text-sm"
          />
          <input
            value={meta.model}
            onChange={(e) => setMeta({ ...meta, model: e.target.value })}
            placeholder="nama model"
            className="w-full rounded-lg bg-surface-2 px-3 py-2 text-sm"
          />

          <div className="flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API key (disembunyiin)"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm"
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              className="press rounded-lg bg-surface-2 px-3 text-xs text-muted"
              title={showKey ? "sembunyiin" : "lihat sebentar"}
            >
              {showKey ? "🙈" : "👁️"}
            </button>
          </div>

          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="bikin kata sandi (min. 6 huruf)"
            className="w-full rounded-lg bg-surface-2 px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={pass2}
            onChange={(e) => setPass2(e.target.value)}
            placeholder="ulangi kata sandi"
            className="w-full rounded-lg bg-surface-2 px-3 py-2 text-sm"
          />

          <button
            onClick={simpanKey}
            disabled={busy}
            className="press rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-background disabled:opacity-50"
          >
            Enkripsi & simpan
          </button>
          {preset && (
            <a
              href={preset.keysUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-2 text-xs text-accent-strong underline"
            >
              ambil key {preset.label} ↗
            </a>
          )}
        </div>
      )}

      {msg && (
        <p className={`text-xs ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>
      )}

      <button
        onClick={() => setWhy((v) => !v)}
        className="text-[11px] text-muted underline-offset-2 hover:underline"
      >
        {why ? "tutup penjelasan" : "kenapa dibikin ribet begini?"}
      </button>
      {why && (
        <div className="space-y-1.5 rounded-lg bg-surface-2 p-3 text-[11px] text-muted">
          <p>
            <b className="text-foreground">Mode proxy:</b> key gak pernah ada di
            HP lu. Kalau HP-nya hilang atau dipinjam, gak ada yang bisa diambil.
            Alamat proxy dibatasi cuma boleh dipanggil dari alamat app ini.
          </p>
          <p>
            <b className="text-foreground">Mode terenkripsi:</b> yang kesimpen
            cuma hasil acakan. Kata sandi diproses 250.000 putaran PBKDF2 jadi
            kunci AES-GCM; tanpa sandi, isinya gak kebaca — termasuk lewat
            devtools. Setelah dibuka, key cuma ada di memori dan hilang begitu
            halaman ditutup.
          </p>
          <p>
            <b className="text-foreground">Batas jujurnya:</b> mode terenkripsi
            gak nolong kalau ada skrip jahat jalan di halaman yang sama pas
            key-nya lagi kebuka. Kalau mau aman total, pakai proxy.
          </p>
        </div>
      )}
    </div>
  );
}
