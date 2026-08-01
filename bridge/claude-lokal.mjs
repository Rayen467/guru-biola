// Jembatan Claude Code lokal.
//
// Ini jawaban untuk permintaan "pakai langganan Claude Pro saya, bukan API key".
// Lewat API memang tidak bisa — langganan tidak menerbitkan kunci API. Tapi
// Claude Code SENDIRI berjalan memakai langganan itu, dan Claude Code ada di
// komputer ini. Jadi yang dijadikan jembatan bukan langganannya, melainkan
// Claude Code-nya: halaman web memanggil server kecil ini, server ini
// menjalankan `claude -p`, jawabannya dikembalikan.
//
// Tidak ada kunci API, tidak ada pembelian token, tidak ada cookie yang dicuri,
// dan tidak ada yang diakali — Claude Code dipakai persis sebagaimana mestinya.
//
// Jalankan:  node bridge/claude-lokal.mjs
// Sekali saja sebelumnya:  claude   lalu ketik  /login
//
// Menambah alamat yang boleh memanggil:
//   node bridge/claude-lokal.mjs --allow https://situs-lain.example

import { createServer } from "node:http";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT ?? 8787);

// Hanya alamat di daftar ini yang boleh memanggil.
//
// Ini bukan formalitas. Server ini menyambung ke langganan Claude di komputer
// ini, dan browser mengizinkan halaman mana pun mencoba memanggil localhost.
// Tanpa daftar ini, situs sembarangan yang kebetulan dibuka bisa memakai
// langganannya diam-diam. Servernya juga sengaja diikat ke 127.0.0.1 saja,
// jadi tidak ada perangkat lain di jaringan yang bisa menjangkaunya.
const BAWAAN = [
  "https://rayen467.github.io",
  "http://localhost:3000",
  "http://localhost:8944",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8944",
];
const tambahan = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--allow" && process.argv[i + 1]) tambahan.push(process.argv[++i]);
}
const IZIN = new Set([...BAWAAN, ...tambahan]);

const PERINTAH = process.platform === "win32" ? "claude.cmd" : "claude";

function tulisKepala(res, origin, kode = 200) {
  res.writeHead(kode, {
    "content-type": "application/json",
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    // Chrome menuntut ini kalau halaman publik memanggil alamat lokal
    // (Private Network Access). Tanpa header ini, permintaannya diblokir
    // sebelum sampai ke sini dan yang terlihat cuma "gagal fetch".
    "access-control-allow-private-network": "true",
    "access-control-max-age": "600",
  });
}

// Menjalankan Claude Code sekali, promptnya lewat stdin — bukan lewat argumen —
// supaya tidak kena batas panjang baris perintah dan tidak perlu meloloskan
// tanda kutip di Windows.
function tanyaClaude(prompt) {
  return new Promise((selesai, gagal) => {
    const anak = spawn(PERINTAH, ["-p"], {
      shell: process.platform === "win32",
      windowsHide: true,
    });
    let keluar = "";
    let salah = "";
    anak.stdout.on("data", (d) => (keluar += d));
    anak.stderr.on("data", (d) => (salah += d));
    anak.on("error", (e) => gagal(new Error(`Gagal menjalankan ${PERINTAH}: ${e.message}`)));
    anak.on("close", (kode) => {
      const semua = (keluar + salah).trim();
      if (/not logged in|please run \/login/i.test(semua)) {
        gagal(
          Object.assign(
            new Error(
              "Claude Code belum login. Buka terminal, ketik `claude`, lalu ketik /login dan ikuti langkahnya. Cukup sekali."
            ),
            { kode: 401 }
          )
        );
        return;
      }
      if (kode !== 0 && !keluar.trim()) {
        gagal(new Error(semua || `claude keluar dengan kode ${kode}`));
        return;
      }
      selesai(keluar.trim());
    });
    anak.stdin.write(prompt);
    anak.stdin.end();
  });
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin ?? "";
  const bolehTanpaOrigin = !origin; // curl / pengecekan manual
  if (!bolehTanpaOrigin && !IZIN.has(origin)) {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `Alamat ${origin} tidak diizinkan.` }));
    console.log(`ditolak: ${origin}`);
    return;
  }
  const asal = origin || "*";

  if (req.method === "OPTIONS") {
    tulisKepala(res, asal, 204);
    res.end();
    return;
  }

  if (req.method === "GET") {
    tulisKepala(res, asal);
    res.end(JSON.stringify({ ok: true, layanan: "claude-lokal" }));
    return;
  }

  if (req.method !== "POST") {
    tulisKepala(res, asal, 405);
    res.end(JSON.stringify({ error: "Cuma menerima POST." }));
    return;
  }

  let mentah = "";
  for await (const potong of req) mentah += potong;

  try {
    const { systemPrompt = "", messages = [] } = JSON.parse(mentah || "{}");
    const percakapan = messages
      .map((m) => `${m.role === "user" ? "PENGGUNA" : "ASISTEN"}: ${m.content}`)
      .join("\n\n");
    const prompt = [systemPrompt, percakapan].filter(Boolean).join("\n\n---\n\n");

    console.log(`→ ${prompt.length} huruf, menjalankan claude…`);
    const mulai = Date.now();
    const reply = await tanyaClaude(prompt);
    console.log(`← ${reply.length} huruf dalam ${((Date.now() - mulai) / 1000).toFixed(1)}s`);

    tulisKepala(res, asal);
    res.end(JSON.stringify({ reply }));
  } catch (e) {
    const kode = e?.kode ?? 500;
    console.error("gagal:", e?.message ?? e);
    tulisKepala(res, asal, kode);
    res.end(JSON.stringify({ error: e?.message ?? String(e) }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Jembatan Claude Code lokal siap di http://127.0.0.1:${PORT}`);
  console.log(`Alamat yang diizinkan:`);
  for (const a of IZIN) console.log(`  · ${a}`);
  console.log(`\nDi halaman Gubah AI, pilih mode "Claude Code lokal".`);
  console.log(`Kalau muncul pesan belum login: buka terminal lain, ketik claude, lalu /login.\n`);
});
