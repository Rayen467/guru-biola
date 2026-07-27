# 🎻 Guru Biola

Guru privat biola pribadi — dari nol total sampai jalur Paganini. Web app Next.js dengan deteksi nada real-time lewat mic (algoritma McLeod via [pitchy](https://www.npmjs.com/package/pitchy)).

**Versi online: https://rayen467.github.io/guru-biola/** (statis; Guru AI cuma jalan di versi lokal karena butuh server).

## Fitur

| Halaman | Fungsi |
|---|---|
| `/tuner` | Stem senar G-D-A-E. Jarum real-time, presisi cent, tombol nada contoh |
| `/intonasi` | Latihan nada target: senar per senar + tangga nada. Tahan nada ±15 cent selama ~1 detik = kena |
| `/kuping` | Ear training adaptif: tebak nada mana lebih tinggi, interval mengecil kalau jago |
| `/ritme` | Latihan ketepatan tempo: gesek per ketukan, diukur meleset berapa milidetik (kecepetan/kelambatan) |
| `/statistik` | Riwayat 30 hari, streak, akurasi per keterampilan |
| `/notasi` | Baca not balok: not digambar di paranada (SVG, tanpa font musik), dimainkan, diverifikasi lewat mic |
| `/rekam` | Rekam latihan + grafik intonasi per milidetik, pemutar dengan playhead, daftar nada yang paling sering fals |
| `/mic` | Diagnosa deteksi: level, suara latar, SNR, kejernihan, skor harmonik, kerataan spektrum + alasan diterima/ditolak |
| `/metronome` | Metronom presisi (dijadwalkan ke clock audio, bukan timer JS). Tap tempo, birama, subdivisi, bar hening, tempo naik otomatis |
| `/lagu` | Mode karaoke-biola: nada baru maju kalau dimainkan benar |
| `/fingerboard` | Peta posisi jari (posisi 1), klik = dengar nadanya |
| `/kurikulum` | 10 level, dari kenalan biola sampai Caprice 24. Checklist tersimpan otomatis |
| `/silabus` | Peta level app ↔ grade ujian resmi edisi terbaru (ABRSM from 2024, Trinity from 2025, Suzuki revisi) |
| `/guru` | Chat dengan "Maestro" — guru AI yang tahu progress latihanmu |

Progress disimpan di localStorage browser (tanpa akun). Waktu latihan tercatat
otomatis selama mic menyala (tuner/intonasi/lagu) — beranda menampilkan streak
harian dan grafik 7 hari terakhir.

### Deploy ulang ke GitHub Pages

```bash
npm run build:static
```

Lalu dorong isi `out/` ke branch `gh-pages` (Pages menyajikan dari branch itu).
`scripts/build-static.mjs` memarkir `src/app/api` selama build — route handler
POST tidak didukung `output: "export"` — dan menulis `out/.nojekyll` supaya
folder `_next` tidak dibuang Jekyll.

### Deteksi: kenapa bukan cuma algoritma pitch

Algoritma pencari nada (MPM lewat pitchy) SELALU mengembalikan angka — diberi
suara kipas pun ia menjawab. Karena itu `src/lib/detector.ts` menguji ulang
kandidatnya lewat lima lapis: bandpass 165 Hz–5 kHz, ambang level absolut,
jangkauan biola (180–3200 Hz), porsi energi pada deret harmonik, dan kestabilan
nada ±0,2 detik terhadap median (supaya vibrato lebar tidak dianggap goyah).

Skor harmonik dihitung dalam domain ENERGI, bukan magnitudo: noise pita lebar
itu pelan per-bin tetapi tersebar di ribuan bin, dan penjumlahan magnitudo
membuatnya mengalahkan puncak harmonik — akibatnya biola yang dimainkan di
dekat AC ikut ditolak.

Modul ini sengaja bebas Web Audio dan React supaya bisa diuji di Node:

```bash
node --experimental-strip-types scripts/test-detector.mjs
```

Uji itu mensintesis nada biola (termasuk gesekan pelan, vibrato lebar,
biola+kipas, biola+suara orang) dan kasus yang harus ditolak (noise putih,
kipas, suara orang, klik metronom, ketokan, musik dari speaker) pada tiga
setelan sensitivitas: akurasi rata-rata 99% dari 27 kasus.

### Metronom: kenapa tidak pakai `setInterval` biasa

Timer JS meleset 10–50 ms dan itu kedengaran. Bunyi dijadwalkan ke
`AudioContext.currentTime` (lookahead scheduler); `setInterval` hanya mengisi
antrian. Saat tab tidak terlihat, browser menahan interval jadi ~1 detik, jadi
jangkauan penjadwalan otomatis dilebarkan ke 2 detik supaya ketukan tidak bolong
ketika metronom ditinggal di tab lain.

## Jalankan

```bash
npm install
npm run dev
```

Buka http://localhost:3000 (atau `npm run dev -- --port 3100`).
**Pakai Chrome/Edge dan izinkan akses mic.**

## Aktifkan Guru AI

1. Ambil API key gratis di https://console.groq.com → API Keys
2. Copy `.env.local.example` jadi `.env.local`, isi `GROQ_API_KEY=gsk_...`
3. Restart dev server

Model default: `llama-3.3-70b-versatile` (bisa diganti lewat env `GROQ_MODEL`).

## Cara pakai (rutinitas harian 15–30 menit)

1. **Stem dulu** di `/tuner` — wajib tiap mulai
2. **Latihan intonasi** sesuai level di `/kurikulum`
3. **10 soal ear training** di `/kuping`
4. **Rapikan tempo** di `/metronome` (50–60 BPM, satu gesekan penuh per ketuk)
5. Centang latihan yang selesai di `/kurikulum`
6. Bingung apa pun → tanya di `/guru`
