// Aturan penulisan partitur — bagian yang tidak ada hubungannya dengan gambar.
//
// Dipisah dari komponen penggambarnya karena inilah yang menentukan partiturnya
// bisa dibaca atau tidak, dan semuanya bisa diuji tanpa layar: nada dieja jadi
// huruf apa, tanda mulanya apa, biramanya patah di mana, notnya bernilai berapa,
// dan balok mana yang disambung.
//
// Yang bikin partitur lama ambigu, dan semuanya dibereskan di sini:
//   - tidak ada TANDA MULA, jadi tiap F♯ ditulisi kres satu per satu. Di lagu
//     nada dasar D, itu berarti kres bertaburan di sepanjang baris padahal
//     pemain cukup diberi tahu sekali di awal.
//   - tidak ada GARIS BIRAMA, jadi tidak ada cara tahu ketukan berat jatuh di
//     mana.
//   - semua not digambar sama, jadi seperempat dan seperdelapan tidak bisa
//     dibedakan — nilai not tidak terbaca sama sekali.

export const HURUF = ["C", "D", "E", "F", "G", "A", "B"];

// Berapa semiton huruf ini di atas C.
const SEMITON_HURUF = [0, 2, 4, 5, 7, 9, 11];

// Urutan kres dan mol pada tanda mula. Urutan ini baku dan tidak boleh diacak:
// kres selalu F C G D A E B, mol selalu kebalikannya.
export const URUT_KRES = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
export const URUT_MOL = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F

export interface Ejaan {
  huruf: number; // 0..6 = C..B
  ubah: -1 | 0 | 1; // mol / asli / kres
  oktaf: number;
  langkah: number; // langkah diatonis mutlak, buat menaruh di paranada
}

// Posisi diatonis mutlak: dipakai untuk menaruh kepala not. C4 = 28.
export function langkahDari(huruf: number, oktaf: number): number {
  return huruf + 7 * oktaf;
}

// Nada MIDI dieja jadi huruf + tanda. Ejaannya ikut tanda mula: di nada dasar
// yang bermol, A♯ ditulis B♭ — bukan soal selera, itu yang bikin partitur bisa
// dibaca cepat.
export function ejaNada(midi: number, kres: number): Ejaan {
  const kelas = ((midi % 12) + 12) % 12;
  const oktafDasar = Math.floor(midi / 12) - 1;
  const pakaiMol = kres < 0;

  for (let h = 0; h < 7; h++) {
    if (SEMITON_HURUF[h] === kelas) {
      return { huruf: h, ubah: 0, oktaf: oktafDasar, langkah: langkahDari(h, oktafDasar) };
    }
  }
  // Nada hitam: dieja naik dari huruf di bawahnya (kres) atau turun dari huruf
  // di atasnya (mol).
  if (pakaiMol) {
    for (let h = 0; h < 7; h++) {
      if (SEMITON_HURUF[h] === kelas + 1) {
        return { huruf: h, ubah: -1, oktaf: oktafDasar, langkah: langkahDari(h, oktafDasar) };
      }
    }
    // B♭ dari huruf C oktaf berikutnya tidak pernah terjadi; sisanya cuma
    // kelas 11 yang selalu B asli, jadi tidak perlu ditangani.
  }
  for (let h = 0; h < 7; h++) {
    if (SEMITON_HURUF[h] === kelas - 1) {
      return { huruf: h, ubah: 1, oktaf: oktafDasar, langkah: langkahDari(h, oktafDasar) };
    }
  }
  return { huruf: 0, ubah: 0, oktaf: oktafDasar, langkah: langkahDari(0, oktafDasar) };
}

// Tanda mula dipilih dengan cara paling jujur yang ada: dicoba semua, dipakai
// yang paling sedikit meninggalkan tanda tambahan di tengah lagu. Tidak perlu
// menebak mayor atau minornya — yang penting partiturnya paling bersih.
export function tandaMula(midis: number[]): number {
  if (midis.length === 0) return 0;
  const kelas = new Set(midis.map((m) => ((m % 12) + 12) % 12));
  let terbaik = 0;
  let palingSedikit = Infinity;
  for (let k = -7; k <= 7; k++) {
    const nadaKunci = kelasDalamTanda(k);
    let butuh = 0;
    for (const c of kelas) if (!nadaKunci.has(c)) butuh++;
    // Kalau seri, menang yang tandanya lebih sedikit — 0 kres lebih enak dibaca
    // daripada 6 kres kalau dua-duanya sama bersihnya.
    if (butuh < palingSedikit || (butuh === palingSedikit && Math.abs(k) < Math.abs(terbaik))) {
      palingSedikit = butuh;
      terbaik = k;
    }
  }
  return terbaik;
}

// Tujuh nada yang termasuk dalam sebuah tanda mula.
function kelasDalamTanda(kres: number): Set<number> {
  const ubah = ubahanTanda(kres);
  const s = new Set<number>();
  for (let h = 0; h < 7; h++) {
    s.add((((SEMITON_HURUF[h] + ubah[h]) % 12) + 12) % 12);
  }
  return s;
}

// Tiap huruf dinaikkan/diturunkan berapa oleh tanda mula.
export function ubahanTanda(kres: number): number[] {
  const ubah = [0, 0, 0, 0, 0, 0, 0];
  if (kres > 0) for (let i = 0; i < kres && i < 7; i++) ubah[URUT_KRES[i]] = 1;
  if (kres < 0) for (let i = 0; i < -kres && i < 7; i++) ubah[URUT_MOL[i]] = -1;
  return ubah;
}

export type NilaiNot =
  | "penuh"
  | "setengah"
  | "seperempat"
  | "seperdelapan"
  | "seperenambelas";

// Berapa ketuk untuk tiap nilai not (1 ketuk = seperempat).
const KETUK: [NilaiNot, number][] = [
  ["penuh", 4],
  ["setengah", 2],
  ["seperempat", 1],
  ["seperdelapan", 0.5],
  ["seperenambelas", 0.25],
];

export interface Nilai {
  nilai: NilaiNot;
  titik: number; // 0 atau 1
}

// Ketuk diubah jadi bentuk not yang bisa digambar. Titik menambah setengah,
// jadi 1,5 ketuk = seperempat bertitik — bukan "seperempat" bulat-bulat, karena
// kalau dibulatkan begitu, ritme di partiturnya jadi bohong.
export function nilaiDari(ketuk: number): Nilai {
  let terbaik: Nilai = { nilai: "seperempat", titik: 0 };
  let selisih = Infinity;
  for (const [nilai, n] of KETUK) {
    for (const titik of [0, 1]) {
      const total = titik ? n * 1.5 : n;
      const d = Math.abs(total - ketuk);
      if (d < selisih - 1e-9) {
        selisih = d;
        terbaik = { nilai, titik };
      }
    }
  }
  return terbaik;
}

export interface NotMasuk {
  midi: number;
  beats?: number;
  rest?: boolean;
}

export interface NotTata extends Nilai {
  midi: number;
  ketuk: number;
  rest: boolean;
  langkah: number;
  aksidental: "♯" | "♭" | "♮" | null;
  birama: number; // nomor birama, mulai 1
  ketukDiBirama: number;
  awalBirama: boolean;
  grupBalok: number; // -1 = tidak dibalok
}

export interface HasilTata {
  not: NotTata[];
  kres: number;
  ketukPerBirama: number;
  jumlahBirama: number;
}

// Menyusun seluruh baris: birama, ejaan, tanda tambahan, dan grup balok.
export function tataPartitur(
  masuk: NotMasuk[],
  opts: { ketukPerBirama?: number; kres?: number } = {}
): HasilTata {
  const ketukPerBirama = opts.ketukPerBirama ?? 4;
  const kres =
    opts.kres ?? tandaMula(masuk.filter((n) => !n.rest).map((n) => n.midi));
  const ubah = ubahanTanda(kres);

  const not: NotTata[] = [];
  let birama = 1;
  let ketukJalan = 0;
  // Tanda tambahan berlaku sampai akhir birama — jadi harus diingat per birama,
  // dan dilupakan begitu ganti birama. Tanpa ini, satu nada yang di luar tanda
  // mula ditulisi tanda berulang-ulang sepanjang baris.
  let ingatan = new Map<number, number>();

  for (const n of masuk) {
    const ketuk = n.beats ?? 1;
    const awalBirama = ketukJalan === 0;
    if (awalBirama && not.length > 0) ingatan = new Map();

    const { nilai, titik } = nilaiDari(ketuk);

    if (n.rest) {
      not.push({
        midi: 0,
        ketuk,
        rest: true,
        langkah: 0,
        aksidental: null,
        nilai,
        titik,
        birama,
        ketukDiBirama: ketukJalan,
        awalBirama,
        grupBalok: -1,
      });
    } else {
      const eja = ejaNada(n.midi, kres);
      const seharusnya = ingatan.has(eja.langkah)
        ? ingatan.get(eja.langkah)!
        : ubah[eja.huruf];
      let aksidental: NotTata["aksidental"] = null;
      if (eja.ubah !== seharusnya) {
        aksidental = eja.ubah === 1 ? "♯" : eja.ubah === -1 ? "♭" : "♮";
        ingatan.set(eja.langkah, eja.ubah);
      }
      not.push({
        midi: n.midi,
        ketuk,
        rest: false,
        langkah: eja.langkah,
        aksidental,
        nilai,
        titik,
        birama,
        ketukDiBirama: ketukJalan,
        awalBirama,
        grupBalok: -1,
      });
    }

    ketukJalan += ketuk;
    // Toleransi kecil supaya pecahan seperti 0,1+0,2 tidak bikin birama meleset.
    if (ketukJalan >= ketukPerBirama - 1e-6) {
      ketukJalan = 0;
      birama++;
    }
  }

  beriGrupBalok(not, ketukPerBirama);

  return {
    not,
    kres,
    ketukPerBirama,
    jumlahBirama: not.length ? not[not.length - 1].birama : 0,
  };
}

// Balok (garis tebal penyambung tangkai) dipasang untuk not seperdelapan ke
// bawah, dan HANYA di dalam satu ketukan. Ini bukan hiasan: balok yang
// menyeberang ketukan justru menyembunyikan letak ketukan beratnya, yang
// artinya partiturnya jadi lebih susah dibaca, bukan lebih rapi.
function beriGrupBalok(not: NotTata[], ketukPerBirama: number) {
  let grup = 0;
  let i = 0;
  while (i < not.length) {
    const n = not[i];
    const bisa = !n.rest && (n.nilai === "seperdelapan" || n.nilai === "seperenambelas");
    if (!bisa) {
      i++;
      continue;
    }
    const ketukanKe = Math.floor(n.ketukDiBirama + 1e-6);
    let j = i;
    while (j + 1 < not.length) {
      const m = not[j + 1];
      if (m.rest) break;
      if (m.nilai !== "seperdelapan" && m.nilai !== "seperenambelas") break;
      if (m.birama !== n.birama) break;
      if (Math.floor(m.ketukDiBirama + 1e-6) !== ketukanKe) break;
      j++;
    }
    if (j > i) {
      for (let k = i; k <= j; k++) not[k].grupBalok = grup;
      grup++;
    }
    i = j + 1;
  }
  void ketukPerBirama;
}

// Tempat tanda mula digambar: langkah diatonis tiap kres/mol pada kunci G.
// Angka-angka ini baku dalam notasi — kres pertama selalu di garis F atas,
// bukan di F mana saja.
export function letakTandaMula(kres: number): number[] {
  const KRES_LANGKAH = [
    langkahDari(3, 5), // F5
    langkahDari(0, 5), // C5
    langkahDari(4, 5), // G5
    langkahDari(1, 5), // D5
    langkahDari(5, 4), // A4
    langkahDari(2, 5), // E5
    langkahDari(6, 4), // B4
  ];
  const MOL_LANGKAH = [
    langkahDari(6, 4), // B4
    langkahDari(2, 5), // E5
    langkahDari(5, 4), // A4
    langkahDari(1, 5), // D5
    langkahDari(4, 4), // G4
    langkahDari(0, 5), // C5
    langkahDari(3, 4), // F4
  ];
  const n = Math.min(7, Math.abs(kres));
  return (kres >= 0 ? KRES_LANGKAH : MOL_LANGKAH).slice(0, n);
}

// Nama nada dasarnya, buat ditulis di kepala partitur.
export function namaTanda(kres: number): string {
  const MAYOR = [
    "C♭", "G♭", "D♭", "A♭", "E♭", "B♭", "F",
    "C",
    "G", "D", "A", "E", "B", "F♯", "C♯",
  ];
  return MAYOR[kres + 7] ?? "C";
}
