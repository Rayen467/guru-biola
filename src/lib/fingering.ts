// Menentukan JARI, SENAR, dan POSISI untuk sederet nada.
//
// Satu nada bisa dimainkan di beberapa tempat sekaligus — E5 ada di senar A
// (jari 4, posisi 1) dan juga di senar E (senar kosong). Yang menentukan mana
// yang benar bukan notnya sendiri, tapi not sebelum dan sesudahnya: tangan
// malas pindah, dan pindah senar lebih murah daripada geser posisi.
//
// Karena itu pemilihannya tidak bisa per not. Sama seperti pemilih melodi di
// aiTranscribe, ini pencarian jalur: semua kemungkinan tiap not disusun, lalu
// dicari rangkaian dengan ongkos total termurah.
//
// Ini melengkapi noteLabel.stringAndFinger, yang sengaja cuma tahu posisi 1
// dan menyerah di atasnya. Yang ini tahu posisi 1–7.

export interface Senar {
  nama: string;
  open: number; // MIDI senar kosong
}

// Urut dari yang paling rendah.
export const SENAR: Senar[] = [
  { nama: "G", open: 55 },
  { nama: "D", open: 62 },
  { nama: "A", open: 69 },
  { nama: "E", open: 76 },
];

// Jarak semiton jari 1 dari senar kosong untuk tiap posisi. Angka ini bukan
// karangan: posisi 3 jari 1 memang jatuh di kuart (5 semiton) — di senar A itu
// nada D, patokan yang dipakai semua pemain untuk mencari posisi 3.
const PANGKAL: Record<number, number> = {
  1: 2,
  2: 4,
  3: 5,
  4: 7,
  5: 9,
  6: 11,
  7: 12,
};

// Jari ke berapa untuk jarak sekian semiton dari pangkal posisi.
//
// Kuncinya: jari tidak berganti hanya karena nadanya naik setengah. Pemain
// memakai jari yang sama dan menggesernya sedikit — itulah "jari rendah" dan
// "jari tinggi". Tabel ini menyatakan hal itu, bukan memberi satu jari per
// semiton.
const JARI_DARI_JARAK: Record<number, { jari: number; regang: boolean }> = {
  [-1]: { jari: 1, regang: true }, // jari 1 rendah
  0: { jari: 1, regang: false },
  1: { jari: 2, regang: false }, // jari 2 rendah
  2: { jari: 2, regang: false },
  3: { jari: 3, regang: false }, // jari 3 rendah
  4: { jari: 3, regang: false },
  5: { jari: 4, regang: false },
  6: { jari: 4, regang: true }, // jari 4 direntangkan
};

export interface Pilihan {
  midi: number;
  senar: string;
  senarIdx: number;
  jari: number; // 0 = senar kosong
  posisi: number; // 1..7; untuk senar kosong ikut posisi tangan sebelumnya
  regang: boolean;
}

// Semua cara memainkan satu nada.
export function caraMain(midi: number): Pilihan[] {
  const hasil: Pilihan[] = [];
  SENAR.forEach((s, senarIdx) => {
    if (midi === s.open) {
      hasil.push({
        midi,
        senar: s.nama,
        senarIdx,
        jari: 0,
        posisi: 1,
        regang: false,
      });
      return;
    }
    for (const p of [1, 2, 3, 4, 5, 6, 7]) {
      const jarak = midi - s.open - PANGKAL[p];
      const j = JARI_DARI_JARAK[jarak];
      if (!j) continue;
      hasil.push({
        midi,
        senar: s.nama,
        senarIdx,
        jari: j.jari,
        posisi: p,
        regang: j.regang,
      });
    }
  });
  return hasil;
}

// Ongkos. Angkanya menyatakan urutan kesulitan yang dirasakan pemain, dari yang
// paling bikin repot ke yang paling ringan: geser posisi jauh lebih mahal
// daripada pindah senar, dan main di posisi tinggi lebih riskan daripada
// rendah.
// Angkanya bukan kira-kira. Disapu 1296 kombinasi dengan
// scripts/test-fingering.ts terhadap tujuh patokan penjarian baku; ini satu-
// satunya kelompok yang memenuhi ketujuhnya sekaligus menghasilkan penjarian
// paling ringan dimainkan.
export const ONGKOS = {
  geser: 3, // per tingkat posisi yang dilewati
  // Pindah senar itu murah — pemain melakukannya terus-menerus tanpa berpikir.
  // Waktu angka ini masih 2, melodi yang bolak-balik satu oktaf malah dimainkan
  // seluruhnya di senar A sampai posisi 5, cuma demi menghindari empat kali
  // menyeberang. Padahal menyeberang ke senar E di posisi 1 jauh lebih ringan.
  gantiSenar: 0.8, // pindah senar sekali
  lompatSenar: 3, // tambahan per senar kalau lompat lebih dari satu
  // Tinggi posisi ditagih DUA KALI dengan dua alasan berbeda, dan dua-duanya
  // perlu — masing-masing sendirian menghasilkan hasil yang konyol:
  //
  //  - Kalau cuma ditagih per not (versi pertama, 2,5/not), frasa tinggi
  //    dipaksa bertahan di posisi 1–2 dengan jari 4 direntangkan berkali-kali.
  //    Salah, karena tinggal di posisi 3 tidak jadi makin capek not demi not.
  //  - Kalau cuma ditagih saat mendarat (versi kedua), tinggal di atas jadi
  //    gratis, dan jalur termurah malah KEMAH DI POSISI 7 supaya tidak pernah
  //    perlu geser lagi. Juga salah.
  //
  // Yang benar: naik itu mahal (perpindahan tangan), dan berada di atas itu
  // sedikit lebih riskan (intonasi lebih sempit, jarak antarnada makin rapat).
  naikPosisi: 2, // per tingkat, dibayar saat tangan mendarat
  diPosisiTinggi: 0.8, // per tingkat per not, kecil — cuma biar tidak berkemah
  // Posisi genap dikenai tambahan kecil. Bukan karena lebih susah secara fisik,
  // tapi karena jalur yang diajarkan di mana-mana adalah 1 → 3 → 5: patokan
  // rabaannya jelas (posisi 3 jari 1 jatuh di kuart, posisi 5 di kuint), dan
  // murid jauh lebih hafal itu. Tanpa tambahan ini, frasa tinggi keluar sebagai
  // "seluruhnya posisi 4" — hemat geseran, tapi bukan yang dilatih siapa pun.
  posisiGenap: 1.2, // per not, saat tangan ada di posisi 2/4/6
  regang: 2.5, // jari direntangkan atau ditarik mundur
  senarKosong: -0.8, // sedikit disukai: paling gampang dan paling bersih
};

function ongkosSendiri(p: Pilihan): number {
  let c = ONGKOS.diPosisiTinggi * (p.posisi - 1);
  if (p.posisi % 2 === 0) c += ONGKOS.posisiGenap;
  if (p.regang) c += ONGKOS.regang;
  if (p.jari === 0) c += ONGKOS.senarKosong;
  return c;
}

function ongkosAwal(p: Pilihan): number {
  // Not pertama: tangan datang dari luar, jadi tetap membayar tinggi posisinya.
  return ongkosSendiri(p) + ONGKOS.naikPosisi * (p.posisi - 1);
}

function ongkosPindah(a: Pilihan, b: Pilihan): number {
  let c = 0;
  // Senar kosong tidak memindahkan tangan, jadi posisinya tidak dihitung
  // sebagai geseran — tangan boleh menunggu di tempat.
  if (a.jari !== 0 && b.jari !== 0 && a.posisi !== b.posisi) {
    c += ONGKOS.geser * Math.abs(a.posisi - b.posisi);
    c += ONGKOS.naikPosisi * (b.posisi - 1);
  }
  const beda = Math.abs(a.senarIdx - b.senarIdx);
  if (beda > 0) c += ONGKOS.gantiSenar + ONGKOS.lompatSenar * (beda - 1);
  return c;
}

// Jalur jari termurah untuk sederet nada.
export function jalurJari(midis: number[]): Pilihan[] {
  if (midis.length === 0) return [];

  const calon = midis.map(caraMain);
  if (calon.some((c) => c.length === 0)) {
    // Ada nada di luar jangkauan biola. Yang di luar dilewati, sisanya tetap
    // dihitung — lebih berguna daripada menyerah dan tidak menjawab apa pun.
    const bisa = midis.filter((m) => caraMain(m).length > 0);
    return bisa.length === midis.length ? [] : jalurJari(bisa);
  }

  const nilai: number[][] = [];
  const jejak: number[][] = [];
  for (let i = 0; i < calon.length; i++) {
    const baris = calon[i].map((p) => (i === 0 ? ongkosAwal(p) : ongkosSendiri(p)));
    const dari = new Array<number>(calon[i].length).fill(-1);
    if (i > 0) {
      for (let b = 0; b < calon[i].length; b++) {
        let terbaik = Infinity;
        let asal = -1;
        for (let a = 0; a < calon[i - 1].length; a++) {
          const c =
            nilai[i - 1][a] + ongkosPindah(calon[i - 1][a], calon[i][b]);
          if (c < terbaik) {
            terbaik = c;
            asal = a;
          }
        }
        baris[b] += terbaik;
        dari[b] = asal;
      }
    }
    nilai.push(baris);
    jejak.push(dari);
  }

  const akhir = nilai.length - 1;
  let c = 0;
  for (let k = 1; k < nilai[akhir].length; k++) {
    if (nilai[akhir][k] < nilai[akhir][c]) c = k;
  }
  const hasil: Pilihan[] = [];
  for (let i = akhir; i >= 0; i--) {
    hasil.unshift(calon[i][c]);
    c = jejak[i][c];
    if (c < 0 && i > 0) c = 0;
  }

  // Senar kosong tidak punya posisi sendiri; ditulis mengikuti tangan supaya
  // pembacanya tidak melihat "posisi 1" nyempil di tengah bagian posisi 3.
  for (let i = 0; i < hasil.length; i++) {
    if (hasil[i].jari !== 0) continue;
    const tetangga = hasil[i - 1] ?? hasil.find((p) => p.jari !== 0);
    if (tetangga) hasil[i] = { ...hasil[i], posisi: tetangga.posisi };
  }
  return hasil;
}

// Di mana saja tangan berpindah posisi — inilah yang perlu dilatih pelan-pelan.
export interface Geseran {
  ke: number; // indeks not tempat tangan mendarat
  dari: number; // posisi asal
  tujuan: number; // posisi tujuan
}

export function geseran(jalur: Pilihan[]): Geseran[] {
  const hasil: Geseran[] = [];
  let posisiTangan = jalur.find((p) => p.jari !== 0)?.posisi ?? 1;
  for (let i = 0; i < jalur.length; i++) {
    if (jalur[i].jari === 0) continue;
    if (jalur[i].posisi !== posisiTangan) {
      hasil.push({ ke: i, dari: posisiTangan, tujuan: jalur[i].posisi });
      posisiTangan = jalur[i].posisi;
    }
  }
  return hasil;
}

export function ringkasJalur(jalur: Pilihan[]): {
  posisiTertinggi: number;
  jumlahGeser: number;
  senarKosong: number;
  regang: number;
} {
  return {
    posisiTertinggi: jalur.reduce((a, p) => Math.max(a, p.posisi), 1),
    jumlahGeser: geseran(jalur).length,
    senarKosong: jalur.filter((p) => p.jari === 0).length,
    regang: jalur.filter((p) => p.regang).length,
  };
}
