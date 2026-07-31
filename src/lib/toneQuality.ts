// Menilai KUALITAS BUNYI gesekan, bukan nadanya.
//
// Nada bisa tepat sempurna tapi bunyinya tetap jelek, dan itu justru masalah
// paling umum di tahun-tahun pertama. Penyebabnya hampir selalu satu dari dua
// hal, dan dua-duanya meninggalkan jejak yang jelas di spektrum:
//
//   - TERLALU DITEKAN / bow terlalu dekat bridge → senar tidak sempat bergetar
//     utuh, jadi muncul banyak dengung tinggi dan bunyi kasar yang tidak
//     kelipatan nada dasarnya. Terdengar "srek".
//   - KURANG DITEKAN / bow terlalu jauh dari bridge (di atas fingerboard) →
//     nada dasarnya lemah, energinya berhamburan jadi desis. Terdengar
//     "ngempos" atau malah bersiul.
//
// Karena jejaknya berlawanan, sarannya bisa spesifik: bukan "mainnya yang
// bagus", tapi ke arah mana bow-nya harus digeser.

export interface UkuranBunyi {
  kejernihan: number; // 0..1 — porsi energi yang benar-benar di deret harmonik
  kecerahan: number; // rata-rata nomor harmonik berbobot; makin besar makin tajam
  desis: number; // 0..1 — porsi energi kasar di wilayah tinggi
  kuatDasar: number; // 0..1 — porsi energi di nada dasar sendiri
}

export interface PenilaianBunyi extends UkuranBunyi {
  cukupData: boolean;
  alasan?: string;
  rataDb: number;
  ratanya: number; // 0..1 — kerataan volume; 1 = sangat rata
  arah: "kasar" | "ngempos" | "pas";
}

// Rentang wajar untuk biola yang dibunyikan dengan benar. Diperiksa dengan
// spektrum buatan di scripts/test-tone-quality.ts.
export const WAJAR_BUNYI = {
  kejernihanMin: 0.55,
  desisMaks: 0.22,
  kecerahanMin: 1.6,
  kecerahanMaks: 5.5,
  ratanyaMin: 0.7,
};

const HARMONIK_MAKS = 14;

// Berapa tinggi derau di sekitar satu harmonik, diambil dari bin tetangga di
// kiri-kanan yang bukan bagian puncaknya. Dipakai nilai tengah supaya harmonik
// sebelah yang kebetulan berdekatan tidak ikut menaikkan hasilnya.
function lantaiSekitar(
  mag: Float32Array,
  pusat: number,
  lebar: number,
  mulai: number,
  selesai: number
): number {
  const tetangga: number[] = [];
  for (let i = pusat - lebar * 4 - 2; i <= pusat + lebar * 4 + 2; i++) {
    if (i < mulai || i > selesai) continue;
    if (Math.abs(i - pusat) <= lebar + 1) continue;
    tetangga.push(mag[i]);
  }
  if (tetangga.length === 0) return 0;
  tetangga.sort((a, b) => a - b);
  return tetangga[tetangga.length >> 1];
}

// `mag` = besaran linear per bin (bukan dB). `binHz` = lebar satu bin.
export function ukurBunyi(mag: Float32Array, binHz: number, f0: number): UkuranBunyi {
  const binDari = (hz: number) => Math.round(hz / binHz);
  const mulai = Math.max(1, binDari(60));
  const selesai = Math.min(mag.length - 1, binDari(9000));

  let total = 0;
  for (let i = mulai; i <= selesai; i++) total += mag[i] * mag[i];
  if (total <= 0) {
    return { kejernihan: 0, kecerahan: 0, desis: 0, kuatDasar: 0 };
  }

  // Energi tiap harmonik diambil dari puncak di sekitar posisi teoretisnya:
  // senar yang digesek tidak pernah pas di kelipatan bulat, dan bin FFT juga
  // punya lebar. Kalau diambil satu bin persis, harmonik yang ada pun terbaca
  // nol dan bunyi bagus dituduh kotor.
  const lebar = Math.max(1, Math.round((f0 * 0.03) / binHz));
  const amp: number[] = [];
  let energiHarmonik = 0;
  const dipakai = new Set<number>();
  for (let k = 1; k <= HARMONIK_MAKS; k++) {
    const pusat = binDari(f0 * k);
    if (pusat > selesai) break;
    let puncak = 0;
    for (let i = Math.max(mulai, pusat - lebar); i <= Math.min(selesai, pusat + lebar); i++) {
      puncak = Math.max(puncak, mag[i]);
      dipakai.add(i);
    }
    // Lantai derau di sekitar harmonik ini HARUS dikurangi.
    //
    // Tanpa itu, bunyi yang penuh desis terbaca punya harmonik tinggi yang
    // kuat — padahal yang terbaca cuma derau yang kebetulan jatuh di posisi
    // harmonik. Akibatnya bunyi ngempos (yang justru miskin harmonik) terukur
    // "cerah" dan disalahartikan jadi bunyi kasar, lalu murid disuruh
    // mengurangi tekanan — kebalikan dari yang dia butuhkan.
    const lantai = lantaiSekitar(mag, pusat, lebar, mulai, selesai);
    const bersih = Math.max(0, puncak - lantai);
    amp.push(bersih);
    energiHarmonik += bersih * bersih;
  }

  // Desis: energi di wilayah tinggi yang BUKAN bagian deret harmonik. Ini yang
  // membedakan bunyi tajam-tapi-bersih dari bunyi kasar.
  let energiKasar = 0;
  const batasKasar = binDari(f0 * 4);
  for (let i = Math.max(mulai, batasKasar); i <= selesai; i++) {
    if (dipakai.has(i)) continue;
    energiKasar += mag[i] * mag[i];
  }

  const jumAmp = amp.reduce((a, b) => a + b, 0);
  const kecerahan =
    jumAmp > 0 ? amp.reduce((s, a, i) => s + a * (i + 1), 0) / jumAmp : 0;

  return {
    kejernihan: Math.min(1, energiHarmonik / total),
    kecerahan,
    desis: Math.min(1, energiKasar / total),
    kuatDasar: Math.min(1, (amp[0] * amp[0]) / total),
  };
}

// Menggabungkan beberapa pengukuran sepanjang satu gesekan, plus kerataan
// volumenya, jadi satu penilaian.
export function nilaiBunyi(
  ukuran: UkuranBunyi[],
  dbSeri: number[]
): PenilaianBunyi {
  const kosong: PenilaianBunyi = {
    cukupData: false,
    kejernihan: 0,
    kecerahan: 0,
    desis: 0,
    kuatDasar: 0,
    rataDb: -100,
    ratanya: 0,
    arah: "pas",
  };
  if (ukuran.length < 5) {
    return { ...kosong, alasan: "Gesekannya kependekan — tahan minimal 1,5 detik." };
  }

  const rata = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const kejernihan = rata(ukuran.map((u) => u.kejernihan));
  const kecerahan = rata(ukuran.map((u) => u.kecerahan));
  const desis = rata(ukuran.map((u) => u.desis));
  const kuatDasar = rata(ukuran.map((u) => u.kuatDasar));

  const rataDb = dbSeri.length ? rata(dbSeri) : -100;
  // Kerataan volume: naik-turun dalam dB sepanjang gesekan. 6 dB (dua kali
  // lipat) dianggap sudah tidak rata sama sekali.
  const simpangan =
    dbSeri.length > 1
      ? Math.sqrt(rata(dbSeri.map((d) => (d - rataDb) * (d - rataDb))))
      : 0;
  const ratanya = Math.max(0, Math.min(1, 1 - simpangan / 6));

  // Arahnya ditentukan dari dua jejak yang berlawanan tadi.
  let arah: PenilaianBunyi["arah"] = "pas";
  if (desis > WAJAR_BUNYI.desisMaks && kecerahan > WAJAR_BUNYI.kecerahanMaks) {
    arah = "kasar";
  } else if (kejernihan < WAJAR_BUNYI.kejernihanMin || kuatDasar < 0.08) {
    // Nada dasar lemah dan energinya berhamburan — ciri bow kurang gigit.
    arah = desis > WAJAR_BUNYI.desisMaks && kecerahan > WAJAR_BUNYI.kecerahanMaks ? "kasar" : "ngempos";
  } else if (desis > WAJAR_BUNYI.desisMaks) {
    arah = "kasar";
  }

  return {
    cukupData: true,
    kejernihan: Math.round(kejernihan * 100) / 100,
    kecerahan: Math.round(kecerahan * 10) / 10,
    desis: Math.round(desis * 100) / 100,
    kuatDasar: Math.round(kuatDasar * 100) / 100,
    rataDb: Math.round(rataDb),
    ratanya: Math.round(ratanya * 100) / 100,
    arah,
  };
}
