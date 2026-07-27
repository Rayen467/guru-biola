# 🎻 Guru Biola

Guru privat biola pribadi — dari nol total sampai jalur Paganini. Web app Next.js dengan deteksi nada real-time lewat mic (algoritma McLeod via [pitchy](https://www.npmjs.com/package/pitchy)).

## Fitur

| Halaman | Fungsi |
|---|---|
| `/tuner` | Stem senar G-D-A-E. Jarum real-time, presisi cent, tombol nada contoh |
| `/intonasi` | Latihan nada target: senar per senar + tangga nada. Tahan nada ±15 cent selama ~1 detik = kena |
| `/kuping` | Ear training adaptif: tebak nada mana lebih tinggi, interval mengecil kalau jago |
| `/metronome` | Metronom presisi (dijadwalkan ke clock audio, bukan timer JS). Tap tempo, birama, subdivisi, bar hening, tempo naik otomatis |
| `/lagu` | Mode karaoke-biola: nada baru maju kalau dimainkan benar |
| `/fingerboard` | Peta posisi jari (posisi 1), klik = dengar nadanya |
| `/kurikulum` | 10 level, dari kenalan biola sampai Caprice 24. Checklist tersimpan otomatis |
| `/silabus` | Peta level app ↔ grade ujian resmi edisi terbaru (ABRSM from 2024, Trinity from 2025, Suzuki revisi) |
| `/guru` | Chat dengan "Maestro" — guru AI yang tahu progress latihanmu |

Progress disimpan di localStorage browser (tanpa akun). Waktu latihan tercatat
otomatis selama mic menyala (tuner/intonasi/lagu) — beranda menampilkan streak
harian dan grafik 7 hari terakhir.

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
