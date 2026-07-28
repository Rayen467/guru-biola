"use client";

// Data pegangan bow & teknik gesekan.
//
// Tiga mazhab pegangan ini bukan soal selera — beda titik sentuh telunjuk
// mengubah dari mana tekanan datang, dan itu kedengeran. Yang paling banyak
// dipakai sekarang Franco-Belgian; Rusia dipakai buat suara besar; Jerman
// lama sekarang jarang, tapi masih ketemu di sekolah tertentu.

export interface FingerSpot {
  id: string;
  label: string; // jari
  // posisi relatif di gambar frog (0..1)
  x: number;
  y: number;
  note: string;
}

export interface BowStyle {
  id: string;
  name: string;
  alias: string;
  who: string;
  sound: string;
  fingers: FingerSpot[];
  pros: string[];
  cons: string[];
  bestFor: string;
}

export const BOW_STYLES: BowStyle[] = [
  {
    id: "franco-belgian",
    name: "Franco-Belgian",
    alias: "Paling umum dipakai sekarang · dasar metode Galamian",
    who: "Standar di hampir semua konservatori. Dipakai mayoritas pemain modern.",
    sound: "Paling seimbang — gampang pelan, gampang keras, gampang ganti warna.",
    fingers: [
      { id: "thumb", label: "Jempol", x: 0.42, y: 0.72, note: "MENEKUK, ujungnya nyentuh pojok frog ketemu stick. Jangan lurus/kaku — ini engsel utama." },
      { id: "index", label: "Telunjuk", x: 0.28, y: 0.3, note: "Stick nyentuh di TENGAH ruas kedua (antara buku jari pertama dan kedua). Ini sumber tekanan." },
      { id: "middle", label: "Jari tengah", x: 0.42, y: 0.26, note: "Turun santai, ujungnya kira-kira berhadapan sama jempol." },
      { id: "ring", label: "Jari manis", x: 0.55, y: 0.28, note: "Nempel di badan frog, bantu ngerasain keseimbangan." },
      { id: "pinky", label: "Kelingking", x: 0.68, y: 0.22, note: "MELENGKUNG di ATAS stick. Ini penyeimbang berat bow di pangkal." },
    ],
    pros: [
      "Paling luwes buat semua teknik",
      "Gampang dikoreksi kalau salah — banyak guru paham",
      "Kelingking melengkung bikin kontrol di pangkal enak",
    ],
    cons: ["Butuh jempol yang beneran rileks — pemula sering ngunci"],
    bestFor: "Semua orang, apalagi pemula. Kalau bingung mau pilih apa, pilih ini.",
  },
  {
    id: "russian",
    name: "Rusia",
    alias: "Mazhab Auer · dipakai Heifetz",
    who: "Leopold Auer dan murid-muridnya: Heifetz, Elman, Milstein.",
    sound: "Besar, tebal, nembus orkestra. Tenaganya datang dari lengan lewat telunjuk.",
    fingers: [
      { id: "thumb", label: "Jempol", x: 0.44, y: 0.72, note: "Tetap menekuk, tapi tangan lebih 'ditidurkan' (pronasi) ke arah telunjuk." },
      { id: "index", label: "Telunjuk", x: 0.24, y: 0.36, note: "Stick masuk LEBIH DALAM — sampai buku jari pangkal. Ini yang bikin tekanannya gede." },
      { id: "middle", label: "Jari tengah", x: 0.4, y: 0.3, note: "Rapat ke telunjuk, jarak antar jari lebih sempit." },
      { id: "ring", label: "Jari manis", x: 0.52, y: 0.32, note: "Ikut rapat, perannya lebih kecil." },
      { id: "pinky", label: "Kelingking", x: 0.63, y: 0.3, note: "Sering LEPAS dari stick pas main di ujung bow — beda dari Franco-Belgian." },
    ],
    pros: ["Suara paling besar", "Enak buat gesekan panjang dan legato tebal"],
    cons: [
      "Kurang luwes buat teknik mantul (spiccato, sautillé)",
      "Kalau salah pakai, gampang bikin tegang pergelangan",
    ],
    bestFor: "Pemain yang udah mapan dan butuh proyeksi suara besar. Bukan buat pemula.",
  },
  {
    id: "german",
    name: "Jerman lama",
    alias: "Dresden · sekarang jarang diajarkan",
    who: "Mazhab Jerman abad 19. Sekarang tinggal di beberapa sekolah tua.",
    sound: "Renyah dan jelas artikulasinya, tapi rentang dinamikanya lebih sempit.",
    fingers: [
      { id: "thumb", label: "Jempol", x: 0.45, y: 0.7, note: "Berhadapan langsung sama jari tengah." },
      { id: "index", label: "Telunjuk", x: 0.33, y: 0.24, note: "Nyentuh dekat buku jari PERTAMA, jari lebih tegak ke bawah." },
      { id: "middle", label: "Jari tengah", x: 0.45, y: 0.22, note: "Tegak lurus stick, persis di atas jempol." },
      { id: "ring", label: "Jari manis", x: 0.56, y: 0.23, note: "Sejajar, jarak rata." },
      { id: "pinky", label: "Kelingking", x: 0.67, y: 0.24, note: "Di atas stick, lebih lurus dibanding Franco-Belgian." },
    ],
    pros: ["Artikulasi jelas", "Posisi jari gampang dihafal karena rata"],
    cons: ["Kurang luwes", "Sedikit guru yang masih ngajarin"],
    bestFor: "Pengetahuan sejarah. Jangan dipilih tanpa guru yang emang pakai ini.",
  },
];

export interface HoldStep {
  n: number;
  title: string;
  detail: string;
  check: string; // cara ngecek sendiri
}

// Urutan ini penting: jempol dulu, kelingking terakhir. Kalau kebalik,
// jempolnya bakal ngunci buat nahan berat bow.
export const HOLD_STEPS: HoldStep[] = [
  {
    n: 1,
    title: "Gantung tangan, jangan diangkat",
    detail:
      "Berdiri, lepas tangan kanan di samping badan. Rasain jari-jarinya melengkung sendiri tanpa diatur. BENTUK ITU yang dipakai — bukan tangan yang dibuka lebar.",
    check: "Jari melengkung santai, ada rongga di telapak. Kalau jari lurus kaku, ulangi.",
  },
  {
    n: 2,
    title: "Jempol nekuk masuk duluan",
    detail:
      "Taruh UJUNG jempol di sudut antara frog dan stick (di lekukan grip). Jempol harus MENEKUK keluar, kayak lagi bikin huruf O sama jari tengah.",
    check: "Kuku jempol miring, bukan rata. Jempol lurus = mati kontrol, wajib diulang.",
  },
  {
    n: 3,
    title: "Jari tengah & manis turun santai",
    detail:
      "Jatuhin jari tengah dan manis ke badan frog, seberang jempol. Jangan dijepit — cuma nempel.",
    check: "Bow bisa digoyang pelan pakai jempol + dua jari itu tanpa jatuh.",
  },
  {
    n: 4,
    title: "Telunjuk taruh sesuai mazhab",
    detail:
      "Franco-Belgian: stick nyentuh tengah ruas kedua. Jangan sampai stick nyelip ke lipatan buku jari — itu kedalaman Rusia dan bikin kaku kalau salah tempat.",
    check: "Telunjuk agak miring ke depan, bukan tegak lurus.",
  },
  {
    n: 5,
    title: "Kelingking melengkung di atas stick",
    detail:
      "Kelingking naik ke ATAS stick dengan lengkung bulat. Dia yang nahan berat bow di pangkal — kalau lurus/melorot, bow bakal ngedumel di senar.",
    check: "Kelingking nekuk kayak huruf C, ujungnya nempel di stick, bukan di samping.",
  },
  {
    n: 6,
    title: "Cek: bow harus bisa 'napas'",
    detail:
      "Tanpa nyentuh senar, gerakin bow naik-turun pelan cuma pakai jari. Kalau bisa goyang halus, pegangan lu hidup. Kalau kaku, ada yang ngunci.",
    check: "Bow goyang lembut 2-3 cm cuma dari jari, lengan diam.",
  },
];

export interface Mistake {
  icon: string;
  title: string;
  why: string;
  fix: string;
}

export const MISTAKES: Mistake[] = [
  {
    icon: "🔒",
    title: "Jempol lurus / ngunci",
    why: "Ini nomor satu. Jempol lurus bikin semua tenaga jadi jepitan — bunyi jadi kasar, tangan cepat pegal, dan gesekan gak bisa halus.",
    fix: "Latih 'bow hold push-up': dari pegangan normal, luruskan jari pelan sampai bow rebah, terus tarik balik. 10× per hari.",
  },
  {
    icon: "🪂",
    title: "Kelingking melorot / lurus",
    why: "Kelingking penyeimbang berat bow di pangkal. Kalau lurus, berat bow jatuh semua ke senar dan bunyi jadi ngegerus.",
    fix: "Latihan 'rocket': tegakin bow vertikal, tahan cuma pakai jempol + kelingking, 20 detik.",
  },
  {
    icon: "✊",
    title: "Genggaman maut",
    why: "Makin kenceng dipegang, makin kecil kontrol. Getaran senar jadi mati dan bunyi hilang resonansinya.",
    fix: "Pas main, sesekali sengaja lepas kelingking sebentar. Kalau bow langsung goyang liar, berarti lu terlalu ngandelin jepitan.",
  },
  {
    icon: "📐",
    title: "Telunjuk kedalaman",
    why: "Stick masuk sampai lipatan buku jari padahal lu belajar Franco-Belgian. Tekanan jadi berlebihan dan pergelangan kaku.",
    fix: "Geser stick keluar sampai di tengah ruas kedua. Tandain pakai spidol kalau perlu.",
  },
  {
    icon: "🫳",
    title: "Pergelangan mati",
    why: "Pergelangan gak ikut nekuk pas ganti arah, jadi tiap ganti arah kedengeran 'klik'.",
    fix: "Latihan gesekan pendek di pangkal bow: cuma pergelangan yang gerak, lengan diam.",
  },
];

export interface Stroke {
  id: string;
  name: string;
  level: string;
  what: string;
  how: string;
  practice: string;
  tool?: string;
}

export const STROKES: Stroke[] = [
  {
    id: "detache",
    name: "Détaché",
    level: "Level 2-4",
    what: "Satu nada satu gesekan, ganti arah tiap nada. Ini gesekan dasar — 90% latihan awal pakai ini.",
    how: "Bow jalan rata, tekanan tetap, ganti arah tanpa jeda dan tanpa aksen.",
    practice: "Tangga nada 1 oktaf, 1 nada per ketuk di 60 BPM. Dengerin: sambungan antar nada harus mulus, gak ada 'klik'.",
    tool: "/metronome",
  },
  {
    id: "legato",
    name: "Legato / slur",
    level: "Level 5-6",
    what: "Beberapa nada dalam SATU gesekan. Jari yang ganti nada, bow jalan terus.",
    how: "Bagi panjang bow rata sesuai jumlah nada. Jari kiri ganti tepat waktu, tanpa ngerem bow.",
    practice: "Tangga nada 2 nada per gesekan, lalu 4, lalu 8. Bow harus habis pas nada terakhir.",
    tool: "/intonasi",
  },
  {
    id: "martele",
    name: "Martelé",
    level: "Level 6-7",
    what: "Nada bertenaga dengan awalan 'nyantol' lalu berhenti — ada jeda antar nada.",
    how: "Tekan bow ke senar dulu (bow diam), lepas tekanan barengan bow jalan cepat, terus berhenti total.",
    practice: "8 nada martelé di senar A, tiap nada dipisah jeda jelas. Awalannya harus terdengar 'ket'.",
    tool: "/ritme",
  },
  {
    id: "staccato",
    name: "Staccato",
    level: "Level 7",
    what: "Beberapa nada pendek berhenti-henti dalam satu arah gesekan.",
    how: "Rangkaian martelé kecil tanpa ganti arah. Lengan agak tegang terkontrol.",
    practice: "4 nada staccato dalam satu gesekan turun. Pelan dulu — ini soal kontrol, bukan kecepatan.",
  },
  {
    id: "spiccato",
    name: "Spiccato",
    level: "Level 8",
    what: "Bow MEMANTUL dari senar. Bunyinya pendek dan ringan.",
    how: "Cari titik seimbang bow (sekitar sepertiga dari pangkal), jatuhkan bow, biarin mantul sendiri. Jangan dipaksa mantul.",
    practice: "Mulai dari détaché pelan di tengah bow, terus longgarin tekanan sampai bow mulai mantul sendiri di 80-100 BPM.",
    tool: "/metronome",
  },
  {
    id: "sautille",
    name: "Sautillé",
    level: "Level 9",
    what: "Pantulan cepat dan kecil — bow nyaris gak lepas dari senar.",
    how: "Bukan dilempar kayak spiccato: ini hasil gesekan cepat di titik seimbang yang bikin stick mantul sendiri.",
    practice: "Détaché cepat di tengah bow, makin cepat sampai pantulannya muncul sendiri. Kalau dipaksa, malah gak jadi.",
  },
  {
    id: "ricochet",
    name: "Ricochet",
    level: "Level 10",
    what: "Bow dilempar sekali, mantul beberapa kali dalam satu arah.",
    how: "Lempar bow dari ketinggian kecil di sepertiga atas, biarkan gravitasi yang kerja.",
    practice: "Target 3 pantulan per lemparan dulu. Ini teknik khas Paganini.",
  },
  {
    id: "colore",
    name: "Warna bunyi: sul tasto & sul ponticello",
    level: "Level 7+",
    what: "Geser JALUR bow buat ganti warna: dekat fingerboard = lembut berkabut (sul tasto), dekat jembatan = tajam kasar (sul ponticello).",
    how: "Makin dekat jembatan, butuh tekanan lebih besar dan bow lebih pelan; sebaliknya dekat fingerboard.",
    practice: "Main satu nada panjang sambil geser jalur bow pelan dari fingerboard ke jembatan. Dengerin perubahan warnanya.",
  },
];
