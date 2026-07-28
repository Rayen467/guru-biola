"use client";

// Setelan Guru AI untuk versi ONLINE (statis).
//
// Kenapa ada dua jalur:
//   - Di komputer sendiri (`npm run dev`) ada server kecil, jadi key disimpan
//     di .env.local dan tidak pernah sampai ke browser. Itu yang paling aman.
//   - Di GitHub Pages tidak ada server sama sekali. Satu-satunya cara Guru AI
//     hidup di HP adalah browser memanggil penyedia AI langsung, pakai key
//     yang DIMASUKKAN SENDIRI oleh pemiliknya dan disimpan di perangkat itu.
//
// Konsekuensinya harus dibilang apa adanya ke pengguna: key yang disimpan di
// browser bisa dibaca siapa pun yang memegang perangkat itu atau membuka
// devtools-nya. Makanya key ini TIDAK PERNAH ikut dibundel ke dalam kode —
// kalau ikut, semua pengunjung situs dapat key yang sama.

import { useEffect, useState } from "react";

export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const KEY = "guru-biola-ai";
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

const EMPTY: AiSettings = { baseUrl: "", apiKey: "", model: "" };

export function getAiSettings(): AiSettings {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function setAiSettings(s: AiSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event(EVENT));
}

export function clearAiSettings() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function useAiSettings(): AiSettings {
  const [s, setS] = useState<AiSettings>(EMPTY);
  useEffect(() => {
    setS(getAiSettings());
    const on = () => setS(getAiSettings());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return s;
}

export function hasAiKey(s: AiSettings): boolean {
  return !!(s.apiKey && s.baseUrl && s.model);
}

// Panggil penyedia AI langsung dari browser. Dipakai HANYA kalau rute server
// tidak ada (versi statis) dan pengguna sudah mengisi key-nya sendiri.
export async function askDirect(
  s: AiSettings,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  progressSummary?: string
): Promise<string> {
  const res = await fetch(`${s.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${s.apiKey}`,
    },
    body: JSON.stringify({
      model: s.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...(progressSummary
          ? [{ role: "system", content: `Progress murid saat ini: ${progressSummary}` }]
          : []),
        ...messages.slice(-20),
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    // Pesan penyedia dipotong: cukup buat tahu salahnya apa, tanpa muntahin
    // seluruh respons ke layar.
    throw new Error(
      res.status === 401
        ? "Key ditolak penyedia. Cek lagi key-nya, atau bikin key baru."
        : `Penyedia menolak (${res.status}): ${detail.slice(0, 200)}`
    );
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "(jawaban kosong)";
}
