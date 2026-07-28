"use client";

import { useEffect, useRef, useState } from "react";
import { CURRICULUM } from "@/lib/curriculum";
import { loadProgress } from "@/lib/progress";
import { matchPerpustakaan } from "@/lib/perpustakaan";
import { SYSTEM_PROMPT } from "@/lib/guruPrompt";
import { askDirect, askProxy, useAiMeta } from "@/lib/aiSettings";
import { hasVault } from "@/lib/secureKey";
import AiSetup from "@/components/AiSetup";

interface Msg {
  role: "user" | "assistant";
  content: string;
  // dari mana jawabannya: perpustakaan lokal (0 token) atau LLM
  source?: "library" | "llm";
}

const STARTERS = [
  "Gua baru punya biola, mulai dari mana?",
  "Kenapa suara gesekan gua berdecit terus?",
  "Gua harus latihan apa hari ini?",
  "Cara pegang bow yang bener gimana?",
];

function buildProgressSummary(): string {
  const p = loadProgress();
  const done = Object.values(p.doneExercises).filter(Boolean).length;
  const total = CURRICULUM.reduce((n, lv) => n + lv.exercises.length, 0);
  const firstUnfinished = CURRICULUM.find((lv) =>
    lv.exercises.some((_, i) => !p.doneExercises[`${lv.id}:${i}`])
  );
  const ear =
    p.earTraining.total > 0
      ? `ear training ${p.earTraining.correct}/${p.earTraining.total} benar (best streak ${p.earTraining.bestStreak})`
      : "belum pernah ear training";
  const into =
    p.intonation.attempts > 0
      ? `intonasi ${p.intonation.hits}/${p.intonation.attempts} kena`
      : "belum pernah latihan intonasi";
  return `${done}/${total} latihan kurikulum selesai; level sekarang: ${
    firstUnfinished?.title ?? "SEMUA LEVEL KELAR"
  }; ${ear}; ${into}.`;
}

export default function GuruPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const ai = useAiMeta();
  const [showSetup, setShowSetup] = useState(false);
  // Key hasil buka brankas HANYA hidup di sini — tidak pernah ditulis balik ke
  // penyimpanan, jadi hilang begitu halaman ditutup. Itu memang tujuannya.
  const [sessionKey, setSessionKey] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setError(null);

    // Cek perpustakaan dulu: pertanyaan umum dijawab lokal — 0 token, offline.
    const lib = matchPerpustakaan(content);
    if (lib) {
      setMessages([
        ...next,
        { role: "assistant", content: lib.answer, source: "library" },
      ]);
      return;
    }

    setBusy(true);
    try {
      const summary = buildProgressSummary();
      const res = await fetch("/api/guru", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, progressSummary: summary }),
      }).catch(() => null);

      // Versi statis (GitHub Pages) tidak punya rute API — yang balik HTML 404.
      // Di situ browser manggil penyedia AI langsung pakai key milik pengguna
      // sendiri. Kalau key-nya belum diisi, tawarkan setelannya.
      const serverAda =
        !!res &&
        res.status !== 404 &&
        !!res.headers.get("content-type")?.includes("application/json");

      if (!serverAda) {
        // Urutan: proxy dulu (paling aman), baru key terenkripsi yang udah dibuka.
        if (ai.proxyUrl) {
          const reply = await askProxy(ai.proxyUrl, SYSTEM_PROMPT, next, summary);
          setMessages([...next, { role: "assistant", content: reply, source: "llm" }]);
          return;
        }
        if (sessionKey) {
          const reply = await askDirect(ai, sessionKey, SYSTEM_PROMPT, next, summary);
          setMessages([...next, { role: "assistant", content: reply, source: "llm" }]);
          return;
        }
        setShowSetup(true);
        setError(
          hasVault()
            ? "Key-nya kekunci. Masukin kata sandi di panel setelan buat buka — berlaku sampai halaman ini ditutup."
            : "Versi online gak punya server, jadi Guru AI butuh setelan sendiri: pakai proxy (paling aman) atau simpan key terenkripsi. Sementara itu, pertanyaan umum tetap dijawab perpustakaan lokal."
        );
        return;
      }
      const data = await res!.json();
      if (!res!.ok) {
        setError(data.error ?? "Gagal menghubungi guru.");
      } else {
        setMessages([
          ...next,
          { role: "assistant", content: data.reply, source: "llm" },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Koneksi gagal: " + String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-12rem)] max-w-2xl flex-col">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">🧑‍🏫 Maestro — Guru AI</h1>
        <p className="mt-1 text-sm text-muted">
          Guru privat lu, online 24 jam. Dia tahu progress latihan lu di app
          ini.
        </p>
        <button
          onClick={() => setShowSetup((v) => !v)}
          className="press mt-2 rounded-full bg-surface-2 px-3 py-1 text-xs text-muted hover:text-foreground"
        >
          ⚙️ Setelan AI{" "}
          {ai.proxyUrl
            ? "· lewat proxy 🛡️"
            : sessionKey
              ? "· kebuka 🔓"
              : hasVault()
                ? "· terkunci 🔐"
                : "· belum diatur"}
        </button>
      </header>

      {showSetup && (
        <AiSetup
          onClose={() => setShowSetup(false)}
          onUnlocked={setSessionKey}
          unlocked={!!sessionKey}
        />
      )}

      <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-border-soft bg-surface p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Belum ada obrolan. Mulai dengan salah satu ini:
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border-soft bg-surface-2 px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%]" : "max-w-[85%]"}>
            <div
              className={`whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-accent text-background"
                  : "bg-surface-2"
              }`}
            >
              {m.content}
            </div>
            {m.source && (
              <div className="mt-1 text-[10px] text-muted">
                {m.source === "library"
                  ? "📚 dari perpustakaan — 0 token, instan"
                  : "🧠 dari LLM (Maestro mikir langsung)"}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="max-w-[85%] rounded-xl bg-surface-2 px-4 py-2.5 text-sm text-muted">
            Maestro lagi mikir…
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tanya apa aja soal biola…"
          className="flex-1 rounded-full border border-border-soft bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-full bg-accent px-5 py-2.5 font-semibold text-background transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          Kirim
        </button>
      </form>
    </div>
  );
}
