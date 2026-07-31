// Mengukur GESERAN POSISI: pindah tangan dari satu nada ke nada lain di senar
// yang sama.
//
// Ini penyebab fals nomor satu begitu murid keluar dari posisi 1, dan tuner
// biasa tidak menolong karena tuner cuma bilang nada akhirnya benar atau tidak.
// Padahal yang salah biasanya bukan nada akhirnya, melainkan salah satu dari:
//   - MENDARAT MELESET: berhenti di nada yang salah.
//   - KEBABLASAN: lewat dulu dari nadanya, baru balik. Kedengeran "nyari-nyari".
//   - KELAMAAN: geserannya lambat sampai kedengaran bunyi merosot di antara
//     dua nada.
// Ketiganya beda latihannya, jadi ketiganya diukur terpisah.

export interface Cuplik {
  t: number; // milidetik
  freq: number;
}

export interface HasilGeser {
  berhasil: boolean;
  alasan?: string;
  lamaGeserMs: number;
  simpanganSen: number; // + = mendarat ketinggian
  kebablasanSen: number; // seberapa jauh lewat dari nada tujuan sebelum balik
  arahNaik: boolean;
}

// "Sampai" ditentukan dari GERAKANNYA BERHENTI, bukan dari dekatnya ke nada
// tujuan. Dua alasan, dan dua-duanya ketahuan waktu diuji:
//
//  - Kalau syaratnya "masuk ±25 sen dari tujuan", geseran yang mendarat 30 sen
//    meleset jadi DITOLAK mentah-mentah — padahal mendarat meleset itu persis
//    hal yang mau dilaporkan ke murid, bukan dibuang.
//  - Nada yang merosot pelan sudah masuk ±25 sen jauh sebelum tangannya
//    benar-benar berhenti, jadi geseran 700 ms terbaca 567 ms.
//
// Yang menandai geseran selesai itu tangan berhenti bergerak. Setelah itu baru
// dinilai berhentinya di nada yang benar atau tidak.
const DIAM_SEN = 30; // naik-turun sebesar ini masih dianggap diam
const TAHAN_MS = 120;
// Lebih jauh dari ini dari nada tujuan, berarti yang dimainkan nada lain sama
// sekali, bukan geseran yang meleset.
const MASIH_NADA_ITU_SEN = 110;
// Selama masih sedekat ini ke nada awal, tangan dianggap belum berangkat.
// Sengaja rapat: tiap sen ambang di sini langsung jadi waktu yang hilang dari
// laporan. Waktu ambangnya masih 40 sen, geseran 700 ms terbaca 550 ms — 93 ms
// hilang cuma karena menunggu nadanya menjauh dulu. 15 sen masih jauh di atas
// goyangan bacaan mic (±8 sen), jadi aman.
const MASIH_DI_AWAL_SEN = 15;
// Sudah dianggap benar-benar berhenti kalau sedekat ini ke nilai diamnya.
const SUDAH_MENDARAT_SEN = 12;

function senAntara(freq: number, midi: number, a4: number): number {
  return 1200 * Math.log2(freq / (a4 * Math.pow(2, (midi - 69) / 12)));
}

function median(a: number[]): number {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function analisaGeseran(
  cuplik: Cuplik[],
  dariMidi: number,
  keMidi: number,
  a4 = 440
): HasilGeser {
  const gagal = (alasan: string): HasilGeser => ({
    berhasil: false,
    alasan,
    lamaGeserMs: 0,
    simpanganSen: 0,
    kebablasanSen: 0,
    arahNaik: keMidi > dariMidi,
  });

  if (cuplik.length < 10) return gagal("Bacaannya kependekan.");
  const arahNaik = keMidi > dariMidi;

  const keAwal = cuplik.map((c) => senAntara(c.freq, dariMidi, a4));
  const keTujuan = cuplik.map((c) => senAntara(c.freq, keMidi, a4));

  // Kapan tangan berangkat: bacaan TERAKHIR yang masih menempel di nada awal.
  // Diambil yang terakhir, bukan yang pertama keluar — kalau ada satu bacaan
  // nyasar di tengah nada awal, yang pertama keluar itu bukan keberangkatan.
  let berangkat = -1;
  for (let i = 0; i < cuplik.length; i++) {
    if (Math.abs(keAwal[i]) <= MASIH_DI_AWAL_SEN) berangkat = i;
    else if (berangkat >= 0 && Math.abs(keTujuan[i]) <= DIAM_SEN) break;
  }
  if (berangkat < 0) return gagal("Nada awalnya gak kedengeran. Mulai dari nada bawah dulu.");

  // Kapan sampai: nadanya berhenti bergerak (naik-turunnya kecil) selama
  // TAHAN_MS, dan berhentinya masih di sekitar nada tujuan.
  let sampai = -1;
  let akhirDiam = -1;
  for (let i = berangkat + 1; i < cuplik.length; i++) {
    const batas = cuplik[i].t + TAHAN_MS;
    let atas = keTujuan[i];
    let bawah = keTujuan[i];
    let j = i;
    for (; j < cuplik.length && cuplik[j].t <= batas; j++) {
      atas = Math.max(atas, keTujuan[j]);
      bawah = Math.min(bawah, keTujuan[j]);
    }
    const cukupLama = cuplik[j - 1].t - cuplik[i].t >= TAHAN_MS * 0.6;
    if (!cukupLama || atas - bawah > DIAM_SEN) continue;
    const tengah = (atas + bawah) / 2;
    if (Math.abs(tengah) > MASIH_NADA_ITU_SEN) continue;
    sampai = i;
    akhirDiam = j - 1;
    break;
  }
  if (sampai < 0) {
    return gagal("Tangannya gak pernah berhenti — nadanya goyang terus sampai akhir.");
  }

  // Mendarat di mana: nilai tengah selama diam, bukan bacaan pertama — bacaan
  // pertama masih membawa sisa gerakan.
  const simpanganSen = Math.round(median(keTujuan.slice(sampai, akhirDiam + 1)));

  // Jendela "diam" yang pertama lolos itu masih menyerempet ekor gerakan:
  // sebagian isinya nada yang belum berhenti, dan sebarannya kebetulan pas di
  // bawah ambang. Akibatnya geseran dilaporkan selesai lebih cepat dari
  // kenyataan. Dirapatkan dengan maju ke bacaan pertama yang benar-benar sudah
  // duduk di nilai diamnya.
  let mendarat = sampai;
  while (
    mendarat < akhirDiam &&
    Math.abs(keTujuan[mendarat] - simpanganSen) > SUDAH_MENDARAT_SEN
  ) {
    mendarat++;
  }

  // Kebablasan diukur dari TITIK MENDARATNYA, bukan dari nada tujuan.
  // Bedanya penting: yang berhenti 30 sen ketinggian itu mendarat meleset, dia
  // tidak "kebablasan lalu balik". Kalau diukur dari nada tujuan, dua kesalahan
  // yang latihannya beda itu dilaporkan sebagai satu.
  let kebablasan = 0;
  for (let i = berangkat; i <= akhirDiam; i++) {
    const lewat = (arahNaik ? 1 : -1) * (keTujuan[i] - simpanganSen);
    if (lewat > kebablasan) kebablasan = lewat;
  }

  return {
    berhasil: true,
    lamaGeserMs: Math.round(cuplik[mendarat].t - cuplik[berangkat].t),
    simpanganSen,
    kebablasanSen: Math.round(kebablasan),
    arahNaik,
  };
}

// Batas wajar. Geseran yang bagus itu cepat dan tidak nyari-nyari; angkanya
// diambil dari yang lazim dituntut di latihan, bukan dari rekor.
export const WAJAR_GESER = {
  simpanganSen: 15, // mendarat masih dianggap tepat
  kebablasanSen: 20,
  lamaMs: 350,
};
