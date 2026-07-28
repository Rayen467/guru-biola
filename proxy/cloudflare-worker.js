// Penerus (proxy) Guru AI — supaya API key TIDAK PERNAH masuk ke browser.
//
// Kenapa perlu: versi online app ini statis (GitHub Pages), jadi tidak ada
// tempat menyimpan rahasia. Kalau key ditaruh di browser, siapa pun yang
// memegang perangkat itu bisa membacanya. Dengan proxy, browser cuma tahu
// ALAMAT penerusnya; key-nya duduk di server penerus.
//
// Cara pasang (gratis, ±5 menit, tanpa kartu kredit):
//   1. Buka dash.cloudflare.com  ->  Workers & Pages  ->  Create Worker
//   2. Hapus isi editor, tempel seluruh file ini, klik Deploy
//   3. Masuk ke Worker itu -> Settings -> Variables -> Add variable:
//        AI_API_KEY   = (key dari penyedia; centang "Encrypt")
//        AI_BASE_URL  = https://apihub.agnes-ai.com/v1
//        AI_MODEL     = agnes-2.0-flash
//        ALLOW_ORIGIN = https://rayen467.github.io
//   4. Salin alamat Worker-nya, tempel ke halaman /guru -> Setelan AI -> Proxy
//
// Catatan: ALLOW_ORIGIN membatasi siapa yang boleh memanggil proxy ini lewat
// browser. Biarkan persis alamat app-nya; jangan diisi "*" kecuali memang ingin
// siapa pun boleh memakai kuota kamu.

export default {
  async fetch(request, env) {
    const allow = env.ALLOW_ORIGIN || "";
    const cors = {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      Vary: "Origin",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return new Response("POST saja", { status: 405, headers: cors });
    }

    // Tolak permintaan dari halaman lain. Tanpa ini, alamat proxy yang bocor
    // berarti kuota kamu bisa dipakai siapa saja.
    const origin = request.headers.get("Origin");
    if (allow && origin && origin !== allow) {
      return new Response("Origin tidak diizinkan", { status: 403, headers: cors });
    }

    if (!env.AI_API_KEY) {
      return Response.json(
        { error: "AI_API_KEY belum diisi di Settings -> Variables." },
        { status: 503, headers: cors }
      );
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: "Body bukan JSON." }, { status: 400, headers: cors });
    }

    const { messages = [], progressSummary, systemPrompt } = payload;

    // Batas ukuran: tanpa ini, satu permintaan raksasa bisa menghabiskan kuota.
    const trimmed = messages.slice(-20).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? "").slice(0, 4000),
    }));

    const base = (env.AI_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
    const upstream = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.AI_MODEL || "llama-3.3-70b-versatile",
        messages: [
          ...(systemPrompt ? [{ role: "system", content: String(systemPrompt).slice(0, 8000) }] : []),
          ...(progressSummary
            ? [{ role: "system", content: `Progress murid saat ini: ${progressSummary}` }]
            : []),
          ...trimmed,
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return Response.json(
        { error: `Penyedia menolak (${upstream.status}): ${detail.slice(0, 200)}` },
        { status: 502, headers: cors }
      );
    }

    const data = await upstream.json();
    const reply = data?.choices?.[0]?.message?.content ?? "(jawaban kosong)";
    return Response.json({ reply }, { headers: cors });
  },
};
