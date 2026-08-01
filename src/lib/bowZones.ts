// Zona busur dan titik kontak.
//
// Dua hal yang menentukan bunyi, dan keduanya soal TEMPAT:
//   1. bagian busur yang mana yang menempel di senar (zona), dan
//   2. seberapa jauh busurnya dari bridge (titik kontak).
//
// Yang kedua paling sering dilupakan padahal paling menentukan warna bunyi.
// Halaman /suara mengukur akibatnya (kasar vs ngempos); di sini sebabnya.

export interface Zona {
  id: string;
  huruf: string;
  nama: string;
  // Posisi di busur: 0 = pangkal (frog), 1 = ujung (tip).
  dari: number;
  sampai: number;
  beratAlami: string;
  // Inilah yang paling sering diajarkan terbalik.
  yangDilakukanLengan: string;
  dipakaiUntuk: string[];
  jebakan: string;
}

// Titik seimbang busur biola ada sekitar 19 cm dari pangkal pada busur ~74 cm,
// jadi kira-kira di 0,25 panjang busur. Angka ini yang menentukan di mana
// busurnya mau memantul sendiri — bukan selera, tapi letak massanya.
export const TITIK_SEIMBANG = 0.25;

export const ZONA: Zona[] = [
  {
    id: "pangkal",
    huruf: "A",
    nama: "Pangkal (frog)",
    dari: 0,
    sampai: 0.15,
    beratAlami: "Paling berat — seluruh massa busur ada di sini",
    yangDilakukanLengan:
      "LEPASKAN berat, jangan ditambah. Angkat sedikit lewat kelingking.",
    dipakaiUntuk: ["Aksen keras", "Sforzando", "Akor (senar ganda/tripel)", "Awal frasa yang tegas"],
    jebakan:
      "Ditekan penuh di sini itu penyebab bunyi 'srek' nomor satu. Busurnya sudah berat sendiri; tugas lengan justru menahan, bukan menambah.",
  },
  {
    id: "bawah",
    huruf: "B",
    nama: "Bawah-tengah (titik seimbang)",
    dari: 0.15,
    sampai: 0.35,
    beratAlami: "Berat, tapi sudah bisa dikendalikan",
    yangDilakukanLengan: "Berat hampir netral. Di sinilah busur mau memantul sendiri.",
    dipakaiUntuk: ["Spiccato", "Sautillé", "Martelé", "Staccato"],
    jebakan:
      "Kalau spiccato-nya tidak mau mantul, hampir selalu karena busurnya kejauhan dari titik ini — bukan karena tangannya kurang benar.",
  },
  {
    id: "tengah",
    huruf: "C",
    nama: "Tengah",
    dari: 0.35,
    sampai: 0.6,
    beratAlami: "Sedang",
    yangDilakukanLengan: "Tambah sedikit berat lengan.",
    dipakaiUntuk: ["Détaché", "Latihan tangga nada", "Nada sedang yang stabil", "Sebagian besar permainan sehari-hari"],
    jebakan: "Zona teraman, tapi kalau semua dimainkan di sini, dinamikanya jadi datar.",
  },
  {
    id: "atas",
    huruf: "D",
    nama: "Atas-tengah",
    dari: 0.6,
    sampai: 0.85,
    beratAlami: "Ringan",
    yangDilakukanLengan: "Tambah berat lebih banyak lagi supaya bunyinya tidak menipis.",
    dipakaiUntuk: ["Legato panjang", "Peralihan halus", "Nada tahan yang mengalir"],
    jebakan: "Bunyi mulai menipis di sini tanpa disadari, karena telinga terbiasa.",
  },
  {
    id: "ujung",
    huruf: "E",
    nama: "Ujung (tip)",
    dari: 0.85,
    sampai: 1,
    beratAlami: "Paling ringan — massa busur jauh dari sini",
    yangDilakukanLengan:
      "Berat lengan PALING BANYAK di sini. Ini kebalikan dari yang dikira kebanyakan orang.",
    dipakaiUntuk: ["Bagian lirih", "Ekor gesekan panjang", "Nada tahan yang halus"],
    jebakan:
      "Bukan tempat spiccato. Massanya terlalu jauh, busurnya tidak akan memantul di sini seberapa pun dicoba.",
  },
];

export interface TitikKontak {
  nomor: number;
  nama: string;
  jarak: string;
  butuh: string;
  hasil: string;
}

// Penomoran titik kontak yang dipakai di mana-mana (dari Galamian): 1 paling
// dekat bridge, 5 di atas fingerboard.
export const TITIK_KONTAK: TitikKontak[] = [
  {
    nomor: 1,
    nama: "Mepet bridge (sul ponticello)",
    jarak: "± 1 cm dari bridge",
    butuh: "Busur PELAN + berat besar",
    hasil: "Paling nyaring dan tajam. Kalau busurnya kecepetan, langsung kasar dan pecah.",
  },
  {
    nomor: 2,
    nama: "Dekat bridge",
    jarak: "± 2 cm",
    butuh: "Pelan + berat sedang-besar",
    hasil: "Kuat dan berisi. Dipakai untuk forte.",
  },
  {
    nomor: 3,
    nama: "Tengah",
    jarak: "± setengah jarak bridge–fingerboard",
    butuh: "Sedang + sedang",
    hasil: "Bunyi baku. Kalau bingung, mulai dari sini.",
  },
  {
    nomor: 4,
    nama: "Dekat fingerboard",
    jarak: "± 1 cm sebelum ujung fingerboard",
    butuh: "Agak cepat + ringan",
    hasil: "Lembut dan berkabut. Bagus untuk piano.",
  },
  {
    nomor: 5,
    nama: "Di atas fingerboard (sul tasto)",
    jarak: "Di atas papan jari",
    butuh: "CEPAT + sangat ringan",
    hasil: "Paling lembut, hampir seperti tiupan. Kalau busurnya kepelanan, bunyinya hilang atau bersiul.",
  },
];

export interface TeknikZona {
  id: string;
  nama: string;
  zona: string; // id zona
  titikKontak: number;
  kecepatan: string;
  catatan: string;
}

export const TEKNIK: TeknikZona[] = [
  {
    id: "detache",
    nama: "Détaché",
    zona: "tengah",
    titikKontak: 3,
    kecepatan: "Sedang, rata",
    catatan: "Satu gesekan satu nada, tanpa jeda. Dasar dari hampir semua teknik lain.",
  },
  {
    id: "martele",
    nama: "Martelé",
    zona: "bawah",
    titikKontak: 2,
    kecepatan: "Cepat, lalu berhenti",
    catatan: "Gigit dulu senarnya, baru lepas cepat, lalu DIAM. Diamnya bagian dari tekniknya.",
  },
  {
    id: "spiccato",
    nama: "Spiccato",
    zona: "bawah",
    titikKontak: 3,
    kecepatan: "Sedang, busur dilepas memantul",
    catatan:
      "Cari titik di mana busur memantul sendiri kalau dijatuhkan. Itu titiknya — biasanya sedikit di bawah tengah, BUKAN di ujung.",
  },
  {
    id: "sautille",
    nama: "Sautillé",
    zona: "bawah",
    titikKontak: 3,
    kecepatan: "Sangat cepat, pantulan kecil",
    catatan:
      "Bukan busur yang diangkat — stick-nya sendiri yang bergetar. Cuma jalan di sekitar titik seimbang.",
  },
  {
    id: "legato",
    nama: "Legato panjang",
    zona: "atas",
    titikKontak: 3,
    kecepatan: "Lambat dan rata",
    catatan: "Pakai busur penuh. Kuncinya berat lengan ditambah terus saat menuju ujung.",
  },
  {
    id: "aksen",
    nama: "Aksen / sforzando",
    zona: "pangkal",
    titikKontak: 2,
    kecepatan: "Ledakan pendek",
    catatan: "Manfaatkan berat alami busur, jangan ditambah tekanan tangan.",
  },
  {
    id: "piano",
    nama: "Bagian lirih (piano)",
    zona: "ujung",
    titikKontak: 4,
    kecepatan: "Agak cepat, ringan",
    catatan: "Lirih itu bukan 'kurang tekanan' saja — geser juga menjauh dari bridge.",
  },
  {
    id: "akor",
    nama: "Akor / senar ganda",
    zona: "pangkal",
    titikKontak: 2,
    kecepatan: "Sedang",
    catatan: "Butuh berat, dan pangkal busur sudah menyediakannya.",
  },
];

// Aturan yang mengikat semuanya: keras-lirihnya bukan cuma soal tekanan.
export const SEGITIGA = [
  {
    judul: "Kecepatan busur",
    naik: "Makin cepat → makin keras, tapi busurnya cepat habis",
    turun: "Makin pelan → makin lirih, tapi gampang kasar kalau dekat bridge",
  },
  {
    judul: "Berat lengan",
    naik: "Makin berat → makin kuat, sampai batas senarnya kewalahan",
    turun: "Makin ringan → makin tipis, sampai bunyinya hilang",
  },
  {
    judul: "Titik kontak",
    naik: "Makin dekat bridge → makin nyaring dan tajam",
    turun: "Makin ke fingerboard → makin lembut dan berkabut",
  },
];

// Koreksi terhadap panduan zona yang beredar — ditulis di sini supaya alasannya
// ikut terbaca, bukan cuma "yang benar begini".
export interface Koreksi {
  salah: string;
  benar: string;
  kenapa: string;
}

export const KOREKSI: Koreksi[] = [
  {
    salah: "Spiccato dimainkan di ujung busur karena paling ringan",
    benar: "Spiccato di dekat titik seimbang — bawah-tengah busur",
    kenapa:
      "Pantulan datang dari massa dan lenting stick, bukan dari ringannya. Di ujung, massanya jauh dan stick-nya tidak melenting balik, jadi busurnya tidak akan memantul di situ seberapa pun dicoba. Coba sendiri: jatuhkan busur pelan di senar, cari titik yang memantul paling enak — pasti sekitar seperempat panjang busur dari pangkal.",
  },
  {
    salah: "Di pangkal pakai tekanan penuh",
    benar: "Di pangkal berat justru DILEPAS; di ujung berat DITAMBAH",
    kenapa:
      "Busur paling berat di pangkal dan paling ringan di ujung. Kalau lengannya menambah berat di pangkal, jadi berlebihan — itu bunyi 'srek'. Supaya bunyinya rata dari pangkal sampai ujung, lengan harus melakukan kebalikan dari berat alami busurnya.",
  },
  {
    salah: "Zona busur saja yang menentukan keras-lirih",
    benar: "Ada tiga yang bekerja bersamaan: kecepatan, berat, dan titik kontak",
    kenapa:
      "Titik kontak — jarak busur ke bridge — yang paling menentukan warna bunyi, dan itu sama sekali tidak ada di panduan zona. Dua orang bisa main di zona yang sama dengan berat yang sama, dan bunyinya beda jauh cuma karena satu main dekat bridge dan satunya di atas fingerboard.",
  },
  {
    salah: "Sekrup pensiun",
    benar: "Sekrup penyetel",
    kenapa: "Namanya sekrup penyetel (adjusting screw) — buat mengencangkan rambut busur.",
  },
];
