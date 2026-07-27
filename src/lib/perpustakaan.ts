// Perpustakaan jawaban: pertanyaan umum dijawab dari sini — 0 token, 0 detik, offline.
// Cuma pertanyaan yang gak butuh data personal. Kalau gak ketemu → fallback ke LLM.

export interface LibEntry {
  id: string;
  // AND antar-grup, OR di dalam grup. Semua grup harus ketemu di pertanyaan.
  keywords: string[][];
  answer: string;
}

// Pertanyaan yang nyangkut data personal WAJIB ke LLM (dia yang pegang progress lu).
const PERSONAL_MARKERS = [
  "hari ini",
  "progress",
  "level gua",
  "level saya",
  "level aku",
  "latihan apa",
  "gua udah",
  "saya sudah",
  "statistik",
  "skor gua",
  "skor saya",
  "lanjut apa",
  "berikutnya apa",
];

const ENTRIES: LibEntry[] = [
  {
    id: "pegang-bow",
    keywords: [["pegang", "megang", "grip", "cara pegang"], ["bow", "busur"]],
    answer:
      "Cara pegang bow yang bener:\n\n1. Jempol MENEKUK (jangan lurus kaku), ujungnya nempel di sisi frog.\n2. Empat jari lain melengkung santai di atas stik — kayak megang telur, bukan kayak megang palu.\n3. Kelingking duduk di atas stik, agak menekuk.\n4. Pergelangan lemes. Kalau tangan pegel dalam 2 menit = kekencengan genggamannya.\n\nLatihan tanpa biola dulu: pegang-lepas-pegang 20x sambil nonton TV. Kalau bentuknya udah otomatis, baru gesek.",
  },
  {
    id: "berdecit",
    keywords: [["decit", "berdecit", "squeak", "ngik", "cempreng"]],
    answer:
      "Suara berdecit itu 99% dari 3 hal ini:\n\n1. **Bow terlalu deket ke jembatan (bridge)** — geser dikit ke arah fingerboard.\n2. **Tekanan kurang mantap tapi kecepatan tinggi** — pelanin gesekan, kasih berat lengan (bukan tekanan jari) yang stabil.\n3. **Bow miring** — harus tegak lurus sama senar. Latihan depan cermin.\n\nBonus: rosin kurang juga bikin bunyi tipis-decit. Bow baru butuh 30-50 usapan rosin dulu; bow lama yang jarang dipakai cukup 10-15 usapan.",
  },
  {
    id: "urutan-stem",
    keywords: [["stem", "nyetem", "setem", "tuning", "tune"], ["cara", "urutan", "gimana", "mulai", "dulu"]],
    answer:
      "Urutan stem yang disarankan: **A dulu (440 Hz), lalu D, G, terakhir E.**\n\nCaranya: buka /tuner di app ini, gesek satu senar, lihat jarumnya.\n- Jarum di kiri = nada kerendahan → kencengin senar.\n- Jarum di kanan = ketinggian → kendorin.\n- Pakai **fine tuner** (sekrup kecil di tailpiece) buat koreksi kecil.\n- Pakai **pasak (peg)** cuma kalau melesetnya jauh — puter pelan-pelan sambil PASAKNYA didorong masuk ke arah kotak pasak (pegbox), biar gesekan kayunya nahan pasak gak mundur sendiri.\n\nStem itu wajib TIAP KALI mau latihan. Senar biola gampang bergeser.",
  },
  {
    id: "senar-putus",
    keywords: [["senar"], ["putus", "takut putus"]],
    answer:
      "Senar putus itu normal, bukan bencana:\n\n- Paling sering putus pas nyetem pakai pasak kekencengan. Makanya: puter pasak PELAN, sambil cek tuner terus.\n- Senar E paling tipis = paling gampang putus. Wajar.\n- Beli senar cadangan 1 set yang murah dulu: D'Addario Prelude atau Thomastik Alphayue. (Thomastik Dominant itu senar kelas pro — harganya nyaris sama kayak biola pemula, buat upgrade nanti aja.)\n- Masang senar baru: lihat tutorial video, atau bawa ke toko musik — biasanya dipasangin gratis kalau beli di situ.\n\nSenar baru butuh 1-2 hari 'settle' — bakal sering turun nadanya. Stem aja terus, normal kok.",
  },
  {
    id: "leher-sakit",
    keywords: [["sakit", "pegel", "pegal", "capek", "nyeri"], ["leher", "bahu", "pundak", "dagu"]],
    answer:
      "Leher/bahu sakit = posisi jepitnya salah atau alatnya kurang:\n\n1. **Beli shoulder rest** (sandaran bahu). Ini bukan aksesori mewah, ini kebutuhan. Merk murah kayak Everest/Kun tiruan udah cukup buat mulai.\n2. Biola dijepit dagu + tulang selangka, kepala NUNDUK dikit ke kiri — bukan bahu yang naik ke atas.\n3. Kalau bahu lu ketarik naik terus, itu tanda shoulder rest-nya kurang tinggi.\n\nAturan emas: latihan itu boleh capek otot, TIDAK BOLEH nyeri sendi/leher. Nyeri = berhenti, benerin postur dulu.",
  },
  {
    id: "rosin",
    keywords: [["rosin", "damar", "gosok busur"]],
    answer:
      "Rosin itu getah yang bikin rambut bow 'nyangkut' ke senar — tanpa rosin, bow cuma meluncur licin tanpa bunyi.\n\n- Bow baru: gosok 30-50 usapan bolak-balik pelan.\n- Pemakaian rutin: 5-15 usapan tiap 1-2 sesi latihan.\n- Kebanyakan rosin = bunyi kasar berpasir + debu putih di biola. Lap badan biola pakai kain kering tiap habis main.\n- Rosin murah buat pemula udah cukup. Jangan pusing merk dulu.",
  },
  {
    id: "beli-biola",
    keywords: [["beli", "harga", "murah", "rekomendasi", "bagus"], ["biola"]],
    answer:
      "Buat pemula, patokan realistis:\n\n- **1-2 jutaan**: biola pemula layak (Cervan, Scarlett, atau merk toko lokal yang udah di-setup). Cukup sampai level menengah.\n- **Di bawah 700rb**: biasanya 'VSO' (violin-shaped object) — susah distem, bunyinya nyiksa. Bikin lu nyerah bukan karena lu gak bakat, tapi karena alatnya jelek.\n- Paling penting: **setup**-nya. Jembatan pas, pasak gak macet, senar layak. Beli di toko musik yang mau nge-setup lebih baik daripada online lotere.\n- Sekalian beli: shoulder rest, rosin, tuner udah ada di app ini gratis.\n\nAlternatif hemat: sewa dulu, atau beli bekas yang di-setup ulang.",
  },
  {
    id: "ukuran-biola",
    keywords: [["ukuran", "size", "4/4", "3/4", "1/2"], ["biola"]],
    answer:
      "Ukuran biola:\n\n- Dewasa & remaja (lengan normal): **4/4 (full size)**. Hampir pasti ini punya lu.\n- Anak-anak: 1/4, 1/2, 3/4 tergantung panjang lengan.\n- Cara cek: rentangin tangan kiri ke depan, biola dijepit — kalau telapak tangan bisa melingkar nyaman di scroll (kepala biola), ukurannya pas.\n\nOrang dewasa gak perlu mikir — ambil 4/4.",
  },
  {
    id: "jari-sakit",
    keywords: [["jari"], ["sakit", "perih", "kapalan", "lecet"]],
    answer:
      "Ujung jari kiri perih itu FASE WAJIB semua pemain string. Kabar baiknya:\n\n- 2-4 minggu latihan rutin → kulit menebal (kapalan tipis) → gak sakit lagi.\n- Latihan pendek tapi sering (15-20 menit) lebih baik daripada maraton 2 jam yang bikin jari lecet.\n- Kalau sampai melepuh/berdarah = kebanyakan, istirahat 1-2 hari.\n- JANGAN pakai plester pas main — bikin lu gak bisa ngerasain senar, intonasi kacau.\n\nSakitnya investasi. Semua pemain biola pernah lewat sini.",
  },
  {
    id: "berapa-lama",
    keywords: [["berapa lama", "berapa bulan", "berapa tahun", "kapan bisa", "sampai bisa"]],
    answer:
      "Patokan realistis dengan latihan rutin 15-30 menit/hari:\n\n- **2-4 minggu**: bunyi bersih di senar kosong, bisa stem sendiri.\n- **2-3 bulan**: Twinkle Twinkle utuh, gak fals parah.\n- **6-12 bulan**: beberapa lagu sederhana, tangga nada 2 oktaf, mulai enak didengar.\n- **2-3 tahun**: repertoar pelajar (Vivaldi A minor), vibrato jalan.\n- **5-10+ tahun**: wilayah Paganini. Serius, segitu.\n\nYang paling nentuin bukan bakat — tapi RUTIN. 15 menit tiap hari ngalahin 3 jam sekali seminggu, karena otot lu lupa kalau jeda lama.",
  },
  {
    id: "durasi-latihan",
    keywords: [["latihan"], ["berapa menit", "berapa jam", "durasi", "sehari"]],
    answer:
      "Buat pemula: **15-30 menit per hari, TIAP hari.**\n\nBagi begini:\n- 3 menit: stem (/tuner)\n- 5 menit: senar kosong / tangga nada pelan (/intonasi)\n- 10 menit: materi level lu di /kurikulum\n- 5 menit: ear training (/kuping)\n\nLebih dari 45 menit buat pemula malah kontraproduktif — konsentrasi buyar, postur ambruk, jari lecet. Nambah durasi nanti aja pas udah level 5+.",
  },
  {
    id: "nada-fals",
    keywords: [["fals", "mblero", "meleset", "gak pas", "nggak pas", "sumbang"], ["nada", "suara", "bunyi", "terus"]],
    answer:
      "Nada fals di biola itu default, bukan kelainan — biola gak punya fret, semua orang mulai dari fals.\n\nCara ngelawannya:\n1. **Pelan.** Fals paling sering karena buru-buru. 1 nada per 2 detik.\n2. Pakai /intonasi tiap hari — meteran cent-nya kasih tahu persis lu kerendahan atau ketinggian.\n3. Tempel stiker penanda jari (tape) di fingerboard. Legal, semua guru nyaranin ini buat pemula.\n4. Latih kuping di /kuping — lama-lama lu DENGER sendiri falsnya sebelum lihat meteran.\n\nTarget realistis: meleset < 20 cent dulu, bukan langsung sempurna.",
  },
  {
    id: "tape-stiker",
    keywords: [["stiker", "tape", "penanda", "tempel", "fret palsu"]],
    answer:
      "Stiker/tape penanda jari itu SAH dan disarankan buat pemula — bukan curang:\n\n- Pakai tape tipis (washi tape / tape khusus fingerboard) di posisi jari 1 dan jari 3 dulu.\n- Cara nentuin posisinya: buka /intonasi, geser jari sampai jarum hijau di nada target, tandai titik itu.\n- Dipakai 3-6 bulan, lalu lepas satu-satu pas kuping lu udah kebentuk.\n\nSemua metode Suzuki pakai ini. Guru yang ngelarang tape buat pemula justru yang aneh.",
  },
  {
    id: "urutan-senar",
    keywords: [["senar"], ["urutan", "nama", "apa aja", "gdae", "g d a e"]],
    answer:
      "4 senar biola, dari paling tebal/rendah ke paling tipis/tinggi:\n\n**G – D – A – E**\n\n- G3 (196 Hz) — paling kiri kalau biola di posisi main\n- D4 (293.7 Hz)\n- A4 (440 Hz) — patokan stem\n- E5 (659.3 Hz) — paling tipis, paling nyaring\n\nJembatan keledai: **G**ajah **D**uduk **A**tas **E**mber. Cek nadanya di /tuner.",
  },
  {
    id: "not-balok",
    keywords: [["not balok", "notasi", "partitur", "sheet music", "baca not"]],
    answer:
      "Perlu bisa baca not balok gak? Jujur:\n\n- **Level 0-5**: belum wajib. App ini pakai nama nada (A, B, C#) — cukup.\n- **Level 6+**: mulai penting, karena repertoar beneran ditulis di not balok.\n- Belajarnya gak berat kok: kunci G doang, 15-30 menit sehari selama 2 minggu udah kebaca.\n\nSaran: fokus bunyi dulu, notasi nyusul. Banyak pemain hebat mulai dari kuping. Tapi jangan diskip selamanya — not balok itu gerbang ke ribuan lagu.",
  },
  {
    id: "vibrato",
    keywords: [["vibrato"]],
    answer:
      "Vibrato itu goyangan nada yang bikin biola 'nyanyi'. Tapi sabar:\n\n- **Jangan dilatih sebelum Level 7** (posisi & intonasi stabil dulu). Vibrato di atas intonasi fals = fals yang goyang.\n- Latihan awal TANPA bow: jari nempel senar, goyang pergelangan kayak ketuk pintu pelan, 5 menit/hari.\n- Lalu dengan bow di nada panjang, goyangan pelan dulu (2 goyang/detik), baru dipercepat.\n- Butuh 2-6 bulan sampai natural. Semua orang kaku di awal.\n\nFondasi dulu, hiasan belakangan.",
  },
];

export interface LibMatch {
  entry: LibEntry;
}

export function matchPerpustakaan(question: string): LibEntry | null {
  const t = question.toLowerCase();
  // pertanyaan personal → biar LLM yang jawab (dia pegang data progress)
  if (PERSONAL_MARKERS.some((m) => t.includes(m))) return null;

  let best: LibEntry | null = null;
  let bestGroups = 0;
  for (const e of ENTRIES) {
    const matched = e.keywords.filter((group) =>
      group.some((k) => t.includes(k))
    ).length;
    // semua grup harus ketemu; kalau seri, yang grup-nya lebih banyak menang (lebih spesifik)
    if (matched === e.keywords.length && matched > bestGroups) {
      best = e;
      bestGroups = matched;
    }
  }
  return best;
}
