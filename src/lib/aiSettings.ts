"use client";

// Setelan Guru AI untuk versi online (statis).
//
// Tiga jalur, diurutkan dari yang paling aman:
//
//   1. SERVER SENDIRI — app dijalankan di komputer sendiri (`npm run dev`).
//      Key ada di .env.local, tidak pernah menyentuh browser. Tidak butuh
//      setelan apa pun di halaman ini.
//
//   2. PROXY — alamat penerus milik sendiri (mis. Cloudflare Worker gratis,
//      lihat proxy/cloudflare-worker.js di repo). Key disimpan di proxy, jadi
//      di browser TIDAK ADA key sama sekali — cuma alamat. Ini yang dipakai
//      kalau mau Guru AI hidup di HP tanpa menaruh rahasia di HP.
//
//   3. KEY TERENKRIPSI — key disimpan di perangkat dalam bentuk terenkripsi
//      dan baru bisa dipakai setelah kata sandinya dimasukkan. Lihat
//      lib/secureKey.ts untuk cara dan batas perlindungannya.
//
// Yang sengaja DIHAPUS: menyimpan key apa adanya di localStorage. Itu bisa
// dibaca siapa pun yang memegang perangkatnya.

import { useEffect, useState } from "react";

export interface AiMeta {
  baseUrl: string;
  model: string;
  proxyUrl: string;
}

const META_KEY = "guru-biola-ai-meta";
const EVENT = "guru-biola-ai-change";

export const AI_PRESETS = [
  {
    id: "agnes",
    label: "Agnes AI",
    baseUrl: "https://apihub.agnes-ai.com/v1",
    model: "agnes-2.0-flash",
    keysUrl: "https://platform.agnes-ai.com/settings/apiKeys",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    keysUrl: "https://console.groq.com/keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "meta-llama/llama-3.3-70b-instruct",
    keysUrl: "https://openrouter.ai/keys",
  },
] as const;

// Alamat penerus bawaan, ditanam waktu build (NEXT_PUBLIC_AI_PROXY).
// Ini BUKAN rahasia — cuma alamat, dan penerusnya sendiri cuma mau melayani
// permintaan dari alamat app ini. Gunanya: begitu penerusnya sudah jalan,
// Guru AI langsung hidup di HP mana pun tanpa siapa pun perlu ngisi setelan.
export const DEFAULT_PROXY = process.env.NEXT_PUBLIC_AI_PROXY ?? "";

const EMPTY: AiMeta = { baseUrl: "", model: "", proxyUrl: "" };

export function getAiMeta(): AiMeta {
  const base: AiMeta = { ...EMPTY, proxyUrl: DEFAULT_PROXY };
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<AiMeta>;
    // Setelan sendiri menang atas bawaan — tapi kalau kosong, jangan sampai
    // menghapus bawaan yang sudah bekerja.
    return {
      baseUrl: saved.baseUrl ?? base.baseUrl,
      model: saved.model ?? base.model,
      proxyUrl: saved.proxyUrl || base.proxyUrl,
    };
  } catch {
    return base;
  }
}

export function setAiMeta(m: AiMeta) {
  localStorage.setItem(META_KEY, JSON.stringify(m));
  window.dispatchEvent(new Event(EVENT));
}

export function useAiMeta(): AiMeta {
  const [m, setM] = useState<AiMeta>(EMPTY);
  useEffect(() => {
    setM(getAiMeta());
    const on = () => setM(getAiMeta());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return m;
}

export function notifyAiChange() {
  window.dispatchEvent(new Event(EVENT));
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

function buildBody(
  model: string,
  systemPrompt: string,
  messages: ChatMsg[],
  progressSummary?: string
) {
  return {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...(progressSummary
        ? [{ role: "system", content: `Progress murid saat ini: ${progressSummary}` }]
        : []),
      ...messages.slice(-20),
    ],
    temperature: 0.7,
    max_tokens: 1024,
  };
}

function readReply(data: unknown): string {
  const d = data as { choices?: { message?: { content?: string } }[] };
  return d.choices?.[0]?.message?.content ?? "(jawaban kosong)";
}

async function fail(res: Response): Promise<never> {
  const detail = await res.text();
  throw new Error(
    res.status === 401 || res.status === 403
      ? "Key ditolak penyedia. Cek key-nya, atau bikin key baru."
      : `Penyedia menolak (${res.status}): ${detail.slice(0, 200)}`
  );
}

// Jalur 2: lewat proxy sendiri. Browser tidak pernah memegang key.
export async function askProxy(
  proxyUrl: string,
  systemPrompt: string,
  messages: ChatMsg[],
  progressSummary?: string
): Promise<string> {
  const res = await fetch(proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, progressSummary, systemPrompt }),
  });
  if (!res.ok) await fail(res);
  const data = await res.json();
  // Proxy boleh membalas {reply} atau format OpenAI apa adanya.
  return (data as { reply?: string }).reply ?? readReply(data);
}

// Jalur 3: browser memanggil penyedia langsung. `apiKey` datang dari memori
// hasil membuka brankas — jangan pernah menyimpannya kembali ke localStorage.
export async function askDirect(
  meta: AiMeta,
  apiKey: string,
  systemPrompt: string,
  messages: ChatMsg[],
  progressSummary?: string
): Promise<string> {
  const res = await fetch(`${meta.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildBody(meta.model, systemPrompt, messages, progressSummary)),
  });
  if (!res.ok) await fail(res);
  return readReply(await res.json());
}
