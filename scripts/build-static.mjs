// Build versi statis untuk GitHub Pages.
//
// Route handler POST (/api/guru) tidak bisa ikut `output: "export"` — Next
// langsung gagal build. Jadi foldernya dipindah sementara selama build, lalu
// dikembalikan. Di versi statis, halaman /guru otomatis jatuh ke perpustakaan
// lokal karena API-nya tidak ada.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "src", "app", "api");
const parkedDir = join(root, ".api-parked");
const outDir = join(root, "out");

// Tipe rute yang di-generate dev server masih menunjuk ke /api yang barusan
// diparkir, dan itu bikin type check build gagal. Buang dulu.
rmSync(join(root, ".next"), { recursive: true, force: true });

let parked = false;
if (existsSync(apiDir)) {
  renameSync(apiDir, parkedDir);
  parked = true;
  console.log("→ /api diparkir sementara (tidak didukung export statis)");
}

try {
  const res = spawnSync("npx", ["next", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      EXPORT_STATIC: "1",
      NEXT_PUBLIC_STATIC_BUILD: "1",
    },
  });
  if (res.status !== 0) process.exitCode = res.status ?? 1;
} finally {
  if (parked) {
    renameSync(parkedDir, apiDir);
    console.log("→ /api dikembalikan");
  }
}

if (process.exitCode) process.exit(process.exitCode);

// GitHub Pages menjalankan Jekyll, yang MEMBUANG folder berawalan garis bawah —
// termasuk /_next. Tanpa file ini, semua JS/CSS 404.
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, ".nojekyll"), "");
console.log("✓ out/ siap di-deploy (.nojekyll ditulis)");
