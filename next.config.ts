import type { NextConfig } from "next";

// Build statis untuk GitHub Pages dinyalakan lewat env EXPORT_STATIC=1
// (lihat scripts/build-static.mjs). Pages menyajikan project site dari
// subfolder /<nama-repo>, jadi basePath ikut diset — kalau tidak, semua aset
// dan link internal jadi 404.
const isExport = process.env.EXPORT_STATIC === "1";
const basePath = process.env.EXPORT_BASE_PATH ?? "/guru-biola";

const nextConfig: NextConfig = isExport
  ? {
      output: "export",
      basePath,
      trailingSlash: true,
      images: { unoptimized: true },
      // Dipakai kode klien buat nyusun path absolut (service worker, manifest)
      // dan alamat penerus AI bawaan (bukan rahasia — lihat lib/aiSettings.ts).
      env: {
        NEXT_PUBLIC_BASE_PATH: basePath,
        NEXT_PUBLIC_AI_PROXY: process.env.NEXT_PUBLIC_AI_PROXY ?? "",
      },
    }
  : { env: { NEXT_PUBLIC_BASE_PATH: "" } };

export default nextConfig;
