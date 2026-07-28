// Bikin ikon PWA tanpa dependensi apa pun (gak ada sharp/canvas di project ini).
// Piksel digambar manual ke buffer RGBA, terus dibungkus jadi PNG.
//
// Jalankan: node scripts/make-icons.mjs

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const BG = [22, 17, 12, 255]; // --background
const AMBER = [245, 185, 80, 255]; // --accent-strong
const DARK = [33, 26, 19, 255]; // --surface

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // Tiap baris PNG diawali byte filter; pakai 0 (none) biar sederhana.
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Gambar: badan biola bulat warna amber, empat senar gelap, plus dua lubang-f
// yang disederhanakan jadi garis lengkung. Cukup kebaca di ukuran 48 px.
function draw(size, { padding }) {
  const buf = Buffer.alloc(size * size * 4);
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
    buf[i + 3] = c[3];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) put(x, y, BG);
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - padding;

  // badan: dua lingkaran (atas kecil, bawah besar) biar siluetnya mirip biola
  const blob = (bx, by, br) => {
    for (let y = Math.floor(by - br); y <= by + br; y++) {
      for (let x = Math.floor(bx - br); x <= bx + br; x++) {
        const d = Math.hypot(x - bx, y - by);
        if (d <= br) put(x, y, AMBER);
      }
    }
  };
  blob(cx, cy + r * 0.28, r * 0.62);
  blob(cx, cy - r * 0.3, r * 0.46);

  // leher + scroll
  const neckW = Math.max(2, Math.round(r * 0.16));
  for (let y = Math.round(cy - r * 1.02); y < cy - r * 0.5; y++) {
    for (let x = Math.round(cx - neckW / 2); x <= cx + neckW / 2; x++) {
      put(x, y, AMBER);
    }
  }

  // senar: empat garis gelap dari leher sampai bawah badan
  const strings = 4;
  for (let s = 0; s < strings; s++) {
    const off = (s - (strings - 1) / 2) * Math.max(2, r * 0.09);
    for (let y = Math.round(cy - r * 0.95); y < cy + r * 0.8; y++) {
      const x = Math.round(cx + off);
      put(x, y, DARK);
      if (r > 60) put(x + 1, y, DARK);
    }
  }

  return buf;
}

const jobs = [
  { file: "icon-192.png", size: 192, padding: 14 },
  { file: "icon-512.png", size: 512, padding: 38 },
  // maskable: isi utama harus muat di lingkaran aman 80% — makanya paddingnya tebal
  { file: "icon-maskable.png", size: 512, padding: 96 },
];

for (const j of jobs) {
  writeFileSync(join(outDir, j.file), png(j.size, j.size, draw(j.size, j)));
  console.log("✓", j.file);
}
