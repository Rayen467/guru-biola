// Kurikulum: dari nol total sampai jalur Paganini.
// Tiap level punya tujuan + latihan. Latihan bisa link ke alat di app.

export interface Exercise {
  label: string;
  detail: string;
  tool?: string; // href ke alat di app, mis. "/tuner"
}

export interface Level {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  benchmark: string; // patokan standar internasional (ABRSM/Suzuki/etude)
  goals: string[];
  exercises: Exercise[];
}

export const CURRICULUM: Level[] = [
  {
    id: "lv0",
    emoji: "👶",
    title: "Level 0 — Kenalan",
    subtitle: "Belum main. Kenali alatnya dulu.",
    benchmark: "Pra-ujian. ABRSM Prep Test pun nilai postur & pegangan bow duluan.",
    goals: [
      "Tahu nama bagian biola: scroll, pasak (peg), leher, fingerboard, badan, jembatan (bridge), tailpiece, fine tuner, chin rest",
      "Tahu 4 senar dari yang tebal ke tipis: G – D – A – E",
      "Tahu cara pegang bow (busur) dengan rileks",
      "Postur berdiri/duduk: biola dijepit dagu + bahu, TANPA dipegang tangan kiri",
    ],
    exercises: [
      { label: "Hafal urutan senar", detail: "G-D-A-E. Jembatan: Gajah Duduk Atas Ember. Ulangi sampai hafal di luar kepala." },
      { label: "Latihan pegang bow 5 menit/hari", detail: "Jempol menekuk, jari rileks melengkung. Pegang pensil dulu kalau canggung." },
      { label: "Latihan jepit biola 5 menit/hari", detail: "Jepit pakai dagu+bahu, dua tangan lepas. Kalau capek lehernya, shoulder rest wajib beli." },
    ],
  },
  {
    id: "lv1",
    emoji: "🎯",
    title: "Level 1 — Stem (Tuning)",
    subtitle: "Senar harus pas dulu. Ini keahlian yang lu bilang susah — sini komputer yang dengerin.",
    benchmark: "Syarat masuk semua metode (Suzuki Book 1). Di ujian, biola fals langsung motong nilai sebelum not pertama.",
    goals: [
      "Bisa stem 4 senar pakai tuner sampai jarum hijau semua",
      "Ngerti: fine tuner buat koreksi kecil, pasak buat koreksi besar",
      "Paham arah: putar menjauh dari badan = naik, mendekat = turun (umumnya)",
    ],
    exercises: [
      { label: "Stem senar A dulu", detail: "Target A4 = 440 Hz. Pakai fine tuner, gerakan kecil-kecil. Lihat jarum di layar.", tool: "/tuner" },
      { label: "Stem D, G, lalu E", detail: "Satu-satu. Jangan buru-buru. Setiap hari sebelum latihan, wajib stem dulu.", tool: "/tuner" },
    ],
  },
  {
    id: "lv2",
    emoji: "🎻",
    title: "Level 2 — Senar Kosong (Open Strings)",
    subtitle: "Gesek tanpa jari. Fokus: suara bersih, bow lurus.",
    benchmark: "Suzuki Book 1 (latihan senar kosong) · setara ABRSM Prep Test.",
    goals: [
      "Gesek tiap senar dengan suara bersih (tidak berdecit, tidak kena senar sebelah)",
      "Bow jalan lurus, sejajar jembatan, di jalur antara jembatan dan fingerboard",
      "Whole bow: gesek dari pangkal (frog) sampai ujung (tip) pelan-pelan",
    ],
    exercises: [
      { label: "4 ketuk per senar", detail: "Gesek A 4 hitungan turun, 4 hitungan naik. Ulangi tiap senar 10x. Depan cermin biar kelihatan bow miring atau tidak." },
      { label: "Pindah senar", detail: "A-D-A-D pelan. Pindah pakai siku, bukan pergelangan. Lalu D-G, A-E." },
      { label: "Cek nada stabil", detail: "Nyalakan tuner sambil gesek senar kosong. Kalau jarum goyang liar = tekanan bow tidak stabil.", tool: "/tuner" },
    ],
  },
  {
    id: "lv3",
    emoji: "☝️",
    title: "Level 3 — Jari Pertama (Posisi 1)",
    subtitle: "Mulai mencet senar. Tanpa fret — makanya latihan intonasi tiap hari.",
    benchmark: "Suzuki Book 1 (variasi Twinkle) · ABRSM Initial Grade.",
    goals: [
      "Tahu letak jari 1-2-3 di tiap senar (pola: kosong-1-2-3)",
      "Di senar A: B (jari 1), C# (jari 2), D (jari 3)",
      "Main nada pencet dengan intonasi meleset < 20 cent",
    ],
    exercises: [
      { label: "Tempel stiker penanda jari (opsional tapi disarankan)", detail: "Pasang tape tipis di posisi jari 1 dan 3. Ini normal buat pemula, bukan curang." },
      { label: "Latihan intonasi senar A", detail: "Main B-C#-D pakai alat intonasi. Target: jarum hijau minimal 1 detik per nada.", tool: "/intonasi" },
      { label: "Latihan intonasi senar E dan D", detail: "Pola sama. Pelan. Akurasi dulu, kecepatan belakangan.", tool: "/intonasi" },
    ],
  },
  {
    id: "lv4",
    emoji: "🪜",
    title: "Level 4 — Tangga Nada Pertama",
    subtitle: "A mayor 1 oktaf. Fondasi semua lagu.",
    benchmark: "ABRSM Grade 1 — silabus tangga nadanya persis A & D mayor 1 oktaf.",
    goals: [
      "A mayor 1 oktaf naik-turun, semua nada < 15 cent meleset",
      "D mayor 1 oktaf",
      "Mulai latihan kuping: bedakan nada tinggi vs rendah",
    ],
    exercises: [
      { label: "A mayor pelan (1 nada per 2 detik)", detail: "A-B-C#-D-E-F#-G#-A. Pakai alat intonasi sebagai wasit.", tool: "/intonasi" },
      { label: "Ear training 10 soal/hari", detail: "Buta nada itu bisa dilatih. Mulai dari interval besar, makin lama makin kecil.", tool: "/kuping" },
      { label: "D mayor pelan", detail: "D-E-F#-G-A-B-C#-D. Mulai dari senar D.", tool: "/intonasi" },
    ],
  },
  {
    id: "lv5",
    emoji: "🌟",
    title: "Level 5 — Lagu Pertama",
    subtitle: "Twinkle Twinkle ala Suzuki. Semua master biola mulai dari sini. Serius.",
    benchmark: "Suzuki Book 1 tuntas · repertoar ABRSM Grade 1.",
    goals: [
      "Twinkle Twinkle Little Star di senar A & E, hafal, bersih",
      "Ritme stabil (tidak ngebut-ngerem)",
      "Ode to Joy (Beethoven) sebagai lagu kedua",
    ],
    exercises: [
      { label: "Twinkle baris pertama", detail: "A A E E F# F# E | D D C# C# B B A. Main di Mode Lagu — nadanya cuma maju kalau lu bener.", tool: "/lagu" },
      { label: "Rekam & dengarkan", detail: "Rekam pakai HP. Dengarkan: nada fals di mana? Cek nada itu di alat intonasi.", tool: "/intonasi" },
      { label: "Ear training lanjut", detail: "Interval makin kecil. Target akurasi 80%.", tool: "/kuping" },
    ],
  },
  {
    id: "lv6",
    emoji: "🥁",
    title: "Level 6 — Ritme, Dinamika, Jari 4",
    subtitle: "Mulai kedengaran kayak musik beneran.",
    benchmark: "Suzuki Book 2 · ABRSM Grade 2 (slur, dinamika, jari 4) · etude Wohlfahrt Op. 45 awal.",
    goals: [
      "Pakai jari 4 (kelingking) menggantikan senar kosong",
      "Dinamika: bisa main pelan (piano) dan keras (forte)",
      "Detache & slur dasar: 2 nada dalam 1 gesekan",
    ],
    exercises: [
      { label: "Latihan jari 4", detail: "Di senar D: main A pakai jari 4, bandingkan dengan senar A kosong. Harus sama persis nadanya.", tool: "/intonasi" },
      { label: "Tangga nada dengan slur", detail: "A mayor, 2 nada per gesekan. Rata, tanpa aksen di tengah." },
      { label: "G mayor 2 oktaf", detail: "Mulai dari senar G kosong. Tangga nada terpanjang lu sejauh ini.", tool: "/intonasi" },
    ],
  },
  {
    id: "lv7",
    emoji: "🎵",
    title: "Level 7 — Posisi 3 & Vibrato Dasar",
    subtitle: "Naik level dari 'pemain pemula' ke 'pemain beneran'.",
    benchmark: "Suzuki Book 3–4 · ABRSM Grade 3–4 (posisi 3 masuk silabus) · Wohlfahrt/Kayser.",
    goals: [
      "Shifting posisi 1 ↔ posisi 3 dengan mulus",
      "Vibrato lengan/pergelangan dasar di nada panjang",
      "Baca not balok dasar (kalau belum)",
    ],
    exercises: [
      { label: "Latihan shifting glissando", detail: "Geser jari 1 dari B ke D di senar A, pelan, dengarkan nadanya naik. Berhenti pas di D.", tool: "/intonasi" },
      { label: "Vibrato: latihan 'ketuk pintu'", detail: "Tanpa bow dulu. Goyang pergelangan, jari tetap nempel. 5 menit/hari." },
      { label: "Ear training interval kecil", detail: "Level tersulit: beda setengah nada bahkan kurang.", tool: "/kuping" },
    ],
  },
  {
    id: "lv8",
    emoji: "🔥",
    title: "Level 8 — Teknik Menengah",
    subtitle: "Tangga nada 3 oktaf, posisi 2-5, staccato, spiccato.",
    benchmark: "Suzuki Book 4–5 (Vivaldi a minor, Seitz) · ABRSM Grade 5–6 · Mazas Op. 36.",
    goals: [
      "Tangga nada 3 oktaf (G mayor) melewati 4 posisi",
      "Spiccato: bow memantul terkontrol",
      "Repertoar: konserto pelajar (mis. Rieding, Seitz, Vivaldi A minor)",
    ],
    exercises: [
      { label: "G mayor 3 oktaf, metronom 60", detail: "Naik-turun, semua nada dicek intonasinya. Ini latihan seumur hidup pemain biola.", tool: "/intonasi" },
      { label: "Vivaldi A minor mvt 1", detail: "Gerbang menuju repertoar klasik. Potong per 4 birama." },
    ],
  },
  {
    id: "lv9",
    emoji: "⚡",
    title: "Level 9 — Lanjutan",
    subtitle: "Double stops, chord, sautillé, kecepatan.",
    benchmark: "Suzuki Book 7–8 · ABRSM Grade 7–8 · Kreutzer 42 Studies.",
    goals: [
      "Double stops: 2 senar sekaligus, dua-duanya pas nadanya",
      "Tangga nada tierce (third) dan oktaf",
      "Repertoar: Bach Partita/Sonata gerakan mudah, konserto Haydn/Mozart",
    ],
    exercises: [
      { label: "Double stop senar kosong + jari", detail: "Senar A kosong + jari di D. Dengarkan 'gesekan gelombang' saat hampir pas — itu petunjuk alami." },
      { label: "Etude Kreutzer no. 2", detail: "Kitab suci teknik biola. Pelan dan sempurna, bukan cepat dan kotor." },
    ],
  },
  {
    id: "lv10",
    emoji: "👹",
    title: "Level 10 — Jalur Paganini",
    subtitle: "Ricochet, harmonik, pizzicato tangan kiri, up-bow staccato. Butuh bertahun-tahun. Tapi jalurnya jelas.",
    benchmark: "Pasca-Grade 8, wilayah diploma (ARSM/LRSM) · etude Rode & Dont · Paganini 24 Caprices.",
    goals: [
      "Caprice No. 24 tema (versi disederhanakan dulu)",
      "Harmonik alami & buatan",
      "Left-hand pizzicato",
      "Kecepatan + akurasi: tangga nada 3 oktaf metronom 120+",
    ],
    exercises: [
      { label: "Tema Caprice 24, setengah tempo", detail: "Tema aslinya tidak sesulit variasinya. Bisa dimulai di akhir level 8 sebenarnya." },
      { label: "Harmonik alami", detail: "Sentuh (jangan tekan) titik tengah senar = nada 1 oktaf di atas, bunyi seperti seruling." },
      { label: "Rutinitas harian master", detail: "Tangga nada 30 menit + etude 30 menit + repertoar 60 menit. Setiap hari. Itu rahasianya — tidak ada rahasia." },
    ],
  },
];
