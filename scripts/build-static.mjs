// Build versi statis untuk GitHub Pages.
//
// Dibangun di SALINAN sementara, bukan di folder kerja. Dua alasan:
//   1. Route handler POST (/api/guru) tidak bisa ikut `output: "export"`, jadi
//      harus disingkirkan — dan menyingkirkannya di folder asli berbahaya.
//   2. Di Windows, dev server yang lagi jalan mengunci folder; rename apa pun
//      di dalam src/ langsung EPERM. Membangun di salinan bikin build tetap
//      jalan walau dev server (punya sesi lain sekalipun) lagi nyala.
//
// node_modules tidak ikut disalin — dibuatkan junction ke folder aslinya, jadi
// instan dan tidak makan disk.

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = join(tmpdir(), "guru-biola-static-build");
const outDir = join(root, "out");

// Yang disalin cuma yang dibutuhkan build.
const COPY = [
  "src",
  "public",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "eslint.config.mjs",
  "next-env.d.ts",
];

console.log("→ nyiapin salinan build di", work);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
for (const item of COPY) {
  const from = join(root, item);
  if (existsSync(from)) cpSync(from, join(work, item), { recursive: true });
}

// node_modules: junction, bukan salinan (Windows tidak butuh admin untuk ini).
symlinkSync(join(root, "node_modules"), join(work, "node_modules"), "junction");

// API dibuang dari salinan — bukan dari folder asli.
rmSync(join(work, "src", "app", "api"), { recursive: true, force: true });

const res = spawnSync("npx", ["next", "build"], {
  cwd: work,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    EXPORT_STATIC: "1",
    NEXT_PUBLIC_STATIC_BUILD: "1",
  },
});
if (res.status !== 0) {
  process.exit(res.status ?? 1);
}

rmSync(outDir, { recursive: true, force: true });
cpSync(join(work, "out"), outDir, { recursive: true });

// GitHub Pages menjalankan Jekyll, yang MEMBUANG folder berawalan garis bawah —
// termasuk /_next. Tanpa file ini, semua JS/CSS 404.
writeFileSync(join(outDir, ".nojekyll"), "");
console.log("✓ out/ siap di-deploy (.nojekyll ditulis)");
