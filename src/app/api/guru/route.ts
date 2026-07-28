import { NextResponse } from "next/server";
import { SYSTEM_PROMPT } from "@/lib/guruPrompt";

// Proxy ke penyedia AI mana pun yang OpenAI-compatible (Groq, Agnes AI,
// OpenRouter, dll). Key HANYA dibaca di server lewat .env.local dan tidak
// pernah ikut ke browser.
//
// PENTING: jangan pernah menaruh key di variabel berawalan NEXT_PUBLIC_ —
// yang itu ikut dibundel ke JavaScript yang diunduh pengunjung, artinya
// key-nya bisa dibaca siapa pun. Rute ini ada justru supaya key tetap di
// server.

// Nama lama (GROQ_*) tetap didukung supaya setelan yang sudah ada tidak rusak.
const BASE_URL =
  process.env.AI_BASE_URL?.replace(/\/$/, "") ||
  "https://api.groq.com/openai/v1";
const API_KEY = process.env.AI_API_KEY || process.env.GROQ_API_KEY;
const MODEL =
  process.env.AI_MODEL || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// Kepribadian Maestro dipakai bareng sama jalur browser — lihat lib/guruPrompt.ts

export async function POST(req: Request) {
  const apiKey = API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "API key belum di-set. Bikin file .env.local di root project, isi AI_API_KEY=..., AI_BASE_URL=... (alamat OpenAI-compatible penyedia lu), dan AI_MODEL=... — lalu restart dev server.",
      },
      { status: 503 }
    );
  }

  const { messages, progressSummary } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    progressSummary?: string;
  };

  const model = MODEL;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...(progressSummary
          ? [
              {
                role: "system" as const,
                content: `Progress murid saat ini: ${progressSummary}`,
              },
            ]
          : []),
        ...messages.slice(-20),
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    // Pesan aslinya dipotong 300 karakter: cukup buat nebak salahnya apa
    // (model gak ada / key ditolak / kuota habis) tanpa muntahin isi respons
    // panjang ke layar.
    return NextResponse.json(
      { error: `Penyedia AI menolak (${res.status}): ${detail.slice(0, 300)}` },
      { status: 502 }
    );
  }

  const data = await res.json();
  const reply: string =
    data.choices?.[0]?.message?.content ?? "(jawaban kosong)";
  return NextResponse.json({ reply });
}
