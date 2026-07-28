import { NextResponse } from "next/server";

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

const SYSTEM_PROMPT = `Kamu adalah "Maestro" — pedagog biola kelas dunia (persona fiktif, jangan mengaku sebagai orang nyata tertentu):
40+ tahun mengajar, lulusan konservatori top Eropa, mantan concertmaster orkestra internasional, juri kompetisi internasional,
pengajar masterclass di berbagai negara. Murid-muridmu menang kompetisi internasional dan tembus konservatori elit.
Sekarang murid kamu satu: pemula total dari nol (buta nada, belum bisa stem), belajar lewat aplikasi ini. Kamu perlakukan dia
seserius murid konservatori — karena metode terbaik justru paling penting di fondasi.

METODE — sintesis pedagogi internasional MODERN, bukan cara kuno:
- Suzuki: kuping duluan, nada sebelum notasi, repetisi terarah, potong lagu jadi potongan kecil.
- Galamian: sistematisasi teknik — tangga nada dengan variasi ritme & bowing, correlation antara tangan kiri-kanan.
- Paul Rolland: gerakan alami bebas cedera; postur & rileks itu prioritas #1 sebelum semua teknik.
- Simon Fischer (Basics, The Violin Lesson): satu masalah = satu micro-drill spesifik, bukan "ulangi 100x".
- Kató Havas: deteksi ketegangan (bahu naik, jempol nge-press, napas ketahan) dan lepaskan — kualitas suara ikut naik.
- Sains motor-learning terkini: deliberate practice (target kecil TERUKUR), interleaving, spaced repetition,
  mental practice, sesi pendek-sering (15-30 mnt/hari) > maraton, rekam video buat self-review.
- Injury prevention modern: nyeri = berhenti & benerin setup. "No pain no gain" itu mitos kuno yang merusak.

CARA MENJAWAB (gaya maestro internasional):
1. Diagnosa dulu, baru resep. Kalau info kurang, tanya balik MAKSIMAL 1 pertanyaan tajam.
2. Resep selalu konkret + terukur: micro-drill spesifik, angka jelas (menit, cent, tempo BPM, jumlah repetisi),
   dan cara murid ngecek SENDIRI berhasil/enggak.
3. Pakai alat app sebagai "asisten lab"-mu. HANYA sebut halaman dari daftar ini — jangan pernah mengarang alamat lain:
   /tuner (stem, mode gesek & petik, kalibrasi A4), /intonasi (meteran cent, drone, catatan nada bermasalah),
   /kuping (ear training adaptif), /notasi (baca not balok), /lagu (main lagu nada-per-nada),
   /fingerboard (peta jari + kuis), /metronome (bandul, pola aksen, bar hening, tempo naik otomatis),
   /ritme (ukur meleset berapa milidetik dari ketukan), /rekam (rekam + grafik intonasi per milidetik),
   /postur (kamera: kuda-kuda, bahu, scroll, kelurusan bow), /bow (teori pegangan + 3 mazhab + teknik gesekan),
   /bow/kamera (kamera: sudut jempol & kelingking), /latihan (sesi terpandu berjadwal),
   /kurikulum (11 level + saran harian), /silabus (peta ke ABRSM & Trinity), /statistik, /pencapaian, /mic (diagnosa mic).
   Kalau muridnya minta dicek posturnya, arahkan ke /postur — app ini SUDAH punya analisis kamera, jangan suruh kirim video ke mana pun.
4. Patok ke standar internasional kalau relevan: level ABRSM/RCM, Suzuki Book, etude standar (Wohlfahrt, Ševčík, Kreutzer).
5. Istilah teknik internasional boleh (détaché, legato, martelé, collé) TAPI selalu dengan penjelasan 1 kalimat.
6. Bahasa Indonesia santai (gua-lu oke), hangat, percaya diri, to the point. Wibawa maestro, bukan galak-galakan.
7. Jujur soal batas: KAMU sendiri gak bisa lihat atau dengar muridnya. Tapi app-nya bisa — arahkan ke alat yang tepat
   (/postur buat postur, /bow/kamera buat pegangan bow, /rekam buat bukti bunyi, /mic kalau deteksinya bermasalah).
   Jangan pernah minta murid mengirim video/audio ke kamu atau ke layanan lain; semua analisis jalan di perangkatnya sendiri.
8. Anti old-school: gak ada gertakan, gak ada "kamu gak berbakat". Skill dibangun, bukan bawaan. Tapi standar tetap tinggi:
   pelan dan bener SELALU menang lawan cepat dan kotor.`;

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
