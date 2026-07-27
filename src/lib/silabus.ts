// Peta jalur ujian resmi versi TERBARU (dicek 27 Juli 2026).
//
// Aturan isi file ini: cuma yang bisa diverifikasi dari sumber resmi. Daftar
// skala per grade sengaja TIDAK ditulis lengkap — ABRSM mengunci PDF silabusnya
// (HTTP 403), jadi yang detail dilempar ke link resmi biar gak ada yang salah
// hafal. Yang ditulis di sini yang memang terkonfirmasi.

export interface ExamBoard {
  id: string;
  name: string;
  edition: string; // edisi/silabus yang lagi berlaku
  validity: string;
  url: string;
  components: string[];
  notes: string[];
}

export const BOARDS: ExamBoard[] = [
  {
    id: "abrsm",
    name: "ABRSM (Inggris)",
    edition: "Bowed Strings — silabus 'from 2024'",
    validity: "Berlaku sejak 1 Januari 2024, sampai ada pengumuman berikutnya.",
    url: "https://www.abrsm.org/en-gb/instruments/bowed-strings/violin",
    components: [
      "3 lagu (dipilih dari daftar repertoar tiap grade)",
      "Tangga nada & arpeggio",
      "Sight-reading (baca langsung partitur yang belum pernah dilihat)",
      "Tes aural (kuping)",
    ],
    notes: [
      "Yang diperbarui di edisi 2024 cuma daftar repertoarnya. Tangga nada, sight-reading, dan tes aural TIDAK berubah dari silabus 2020 — jadi materi teknik lama masih kepakai.",
      "Jenjang: Initial Grade, lalu Grade 1 sampai Grade 8, lanjut diploma.",
      "Grade 1 tangga nadanya: D mayor dan A mayor, 1 oktaf, plus arpeggio di dua nada dasar yang sama. Persis yang dilatih di menu Intonasi.",
    ],
  },
  {
    id: "trinity",
    name: "Trinity College London",
    edition: "Strings — silabus refresh 2025 (buku 'Violin Exam Pieces from 2025')",
    validity:
      "Buku dari 2025 dipakai sekarang; lagu-lagu dari buku 2020 tetap sah dipakai tanpa batas waktu.",
    url: "https://www.trinitycollege.com/qualifications/music/grade-exams/strings/repertoire-violin",
    components: [
      "Jalur Technical Work: 3 lagu + kerja teknik",
      "Jalur Repertoire-only: 4 lagu, tanpa kerja teknik",
    ],
    notes: [
      "Ujian bisa tatap muka atau digital (rekaman video). Yang digital boleh pilih salah satu dari dua jalur di atas — cocok buat yang belajar mandiri.",
      "Repertoar barunya masuk gaya jazz dan folk (Omar Puente, Julian Ferraretto, Chris Garrick, Stephen J Wood), bukan klasik doang.",
      "Diploma (ATCL / LTCL / FTCL) pakai daftar repertoar edisi 2026.",
    ],
  },
];

export interface SuzukiPiece {
  no: number;
  title: string;
  composer: string;
  inApp?: string; // id lagu di /lagu kalau udah ada
  public: boolean; // melodi domain publik / tradisional?
}

// Urutan resmi Suzuki Violin School Vol. 1 (edisi revisi/international).
// Urutan ini yang bikin metodenya jalan — jangan diacak.
export const SUZUKI_BOOK1: SuzukiPiece[] = [
  { no: 1, title: "Twinkle, Twinkle Little Star (tema + variasi)", composer: "trad. / Suzuki", inApp: "twinkle", public: true },
  { no: 2, title: "Lightly Row", composer: "trad. Jerman", inApp: "lightly-row", public: true },
  { no: 3, title: "Song of the Wind", composer: "trad.", public: true },
  { no: 4, title: "Go Tell Aunt Rhody", composer: "trad. Amerika", public: true },
  { no: 5, title: "O Come, Little Children", composer: "J. A. P. Schulz", public: true },
  { no: 6, title: "May Song", composer: "trad. Jerman", public: true },
  { no: 7, title: "Long, Long Ago", composer: "T. H. Bayly", public: true },
  { no: 8, title: "Allegro", composer: "S. Suzuki", public: false },
  { no: 9, title: "Perpetual Motion", composer: "S. Suzuki", public: false },
  { no: 10, title: "Allegretto", composer: "S. Suzuki", public: false },
  { no: 11, title: "Andantino", composer: "S. Suzuki", public: false },
  { no: 12, title: "Etude", composer: "S. Suzuki", public: false },
  { no: 13, title: "Minuet 1", composer: "J. S. Bach", public: true },
  { no: 14, title: "Minuet 2", composer: "J. S. Bach", public: true },
  { no: 15, title: "Minuet 3", composer: "J. S. Bach", public: true },
  { no: 16, title: "The Happy Farmer", composer: "R. Schumann", public: true },
  { no: 17, title: "Gavotte", composer: "F.-J. Gossec", public: true },
];

// Level app ↔ grade ujian. Dipakai di /silabus dan /kurikulum.
export interface LadderStep {
  levelIds: string[];
  levelLabel: string;
  grade: string;
  what: string;
  tool?: string;
}

export const LADDER: LadderStep[] = [
  {
    levelIds: ["lv0", "lv1", "lv2"],
    levelLabel: "Level 0–2",
    grade: "Pra-ujian → ABRSM Initial Grade",
    what: "Postur, pegangan bow, stem sendiri, senar kosong bunyinya bersih.",
    tool: "/tuner",
  },
  {
    levelIds: ["lv3", "lv4"],
    levelLabel: "Level 3–4",
    grade: "ABRSM Grade 1",
    what: "Posisi 1 jari 1-2-3, tangga nada D mayor & A mayor 1 oktaf + arpeggio-nya.",
    tool: "/intonasi",
  },
  {
    levelIds: ["lv5"],
    levelLabel: "Level 5",
    grade: "ABRSM Grade 1 (repertoar) · Suzuki Book 1",
    what: "3 lagu utuh dari daftar, tempo stabil, hafal.",
    tool: "/lagu",
  },
  {
    levelIds: ["lv6"],
    levelLabel: "Level 6",
    grade: "ABRSM Grade 2 · Suzuki Book 2",
    what: "Jari 4, slur, dinamika, ritme rapi bareng metronom.",
    tool: "/metronome",
  },
  {
    levelIds: ["lv7"],
    levelLabel: "Level 7",
    grade: "ABRSM Grade 3–4 · Suzuki Book 3–4",
    what: "Pindah ke posisi 3, vibrato dasar, mulai baca partitur beneran.",
  },
  {
    levelIds: ["lv8"],
    levelLabel: "Level 8",
    grade: "ABRSM Grade 5–6 · Suzuki Book 4–5",
    what: "Tangga nada 3 oktaf, spiccato, konserto pelajar (Vivaldi a minor, Seitz).",
  },
  {
    levelIds: ["lv9"],
    levelLabel: "Level 9",
    grade: "ABRSM Grade 7–8 · Suzuki Book 7–8",
    what: "Double stop, Kreutzer, konserto Haydn/Mozart.",
  },
  {
    levelIds: ["lv10"],
    levelLabel: "Level 10",
    grade: "Diploma (ARSM / ATCL / LRSM)",
    what: "Repertoar diploma, etude Rode & Dont, jalur Paganini.",
  },
];
