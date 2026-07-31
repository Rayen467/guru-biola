// Mengukur vibrato dari rekaman nada yang ditahan.
//
// Vibrato itu goyangan nada yang teratur. Tiga hal yang menentukan bagus atau
// tidaknya, dan ketiganya bisa diukur:
//   - KECEPATAN (Hz): berapa kali bolak-balik per detik. Terlalu pelan
//     kedengeran gelisah, terlalu cepat kedengeran tegang.
//   - LEBAR (sen): seberapa jauh naik-turunnya. Terlalu tipis tidak kedengeran,
//     terlalu lebar bikin nadanya kabur.
//   - KERATAAN: apakah tiap goyangan sama panjang dan sama lebar. Ini yang
//     paling membedakan vibrato terlatih dari yang belum.
//
// Yang TIDAK diukur di sini: enak atau tidaknya. Itu selera dan konteks musik.
// Yang diberikan cuma angka dan rentang wajar untuk biola.

export interface Cuplik {
  t: number; // milidetik
  freq: number; // Hz; pemanggil yang menyaring, di sini dianggap sudah bersih
}

export interface HasilVibrato {
  cukupData: boolean;
  alasan?: string;
  durasiDetik: number;
  midi: number; // nada yang digoyang
  pusatSen: number; // simpangan pusat goyangan dari nada pas, dalam sen
  kecepatanHz: number;
  lebarSen: number; // ± sekian sen (setengah dari puncak ke lembah)
  jumlahGoyangan: number;
  kerataanPeriode: number; // 0..1, makin kecil makin rata
  kerataanLebar: number; // 0..1, makin kecil makin rata
  adaVibrato: boolean;
}

// Batas wajar untuk biola. Bukan hukum — ini rentang yang lazim dipakai dan
// diajarkan, dan dipakai hanya untuk memberi saran, bukan menghakimi.
export const WAJAR = {
  kecepatanMin: 5,
  kecepatanMaks: 7.5,
  lebarMin: 10, // ± sen
  lebarMaks: 40,
  kerataanMaks: 0.25,
};

const MIN_DETIK = 1.2;

export function centsFromMidi(freq: number, midi: number, a4 = 440): number {
  const acuan = a4 * Math.pow(2, (midi - 69) / 12);
  return 1200 * Math.log2(freq / acuan);
}

function median(a: number[]): number {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function simpanganRelatif(a: number[]): number {
  if (a.length < 2) return 0;
  const rata = a.reduce((x, y) => x + y, 0) / a.length;
  if (rata === 0) return 0;
  const varian =
    a.reduce((s, v) => s + (v - rata) * (v - rata), 0) / (a.length - 1);
  return Math.sqrt(varian) / Math.abs(rata);
}

export function analisaVibrato(cuplik: Cuplik[], a4 = 440): HasilVibrato {
  const kosong: HasilVibrato = {
    cukupData: false,
    durasiDetik: 0,
    midi: 0,
    pusatSen: 0,
    kecepatanHz: 0,
    lebarSen: 0,
    jumlahGoyangan: 0,
    kerataanPeriode: 0,
    kerataanLebar: 0,
    adaVibrato: false,
  };
  if (cuplik.length < 20) {
    return { ...kosong, alasan: "Nadanya kependekan atau putus-putus." };
  }

  const durasiDetik = (cuplik[cuplik.length - 1].t - cuplik[0].t) / 1000;
  if (durasiDetik < MIN_DETIK) {
    return {
      ...kosong,
      durasiDetik,
      alasan: `Tahan nadanya minimal ${MIN_DETIK} detik — baru goyangannya bisa dihitung.`,
    };
  }

  // Nada yang dimaksud diambil dari NILAI TENGAH, bukan rata-rata: kalau ada
  // satu-dua bacaan nyasar, rata-rata ikut tertarik, nilai tengah tidak.
  const tengahHz = median(cuplik.map((c) => c.freq));
  const midi = Math.round(69 + 12 * Math.log2(tengahHz / a4));
  const sen = cuplik.map((c) => centsFromMidi(c.freq, midi, a4));
  const pusatSen = median(sen);

  // Buang naik-turun lambat (nada yang pelan-pelan meleset, atau geseran) biar
  // yang tersisa cuma goyangan vibratonya. Caranya: kurangi dengan rata-rata
  // bergerak selebar kira-kira dua kali periode vibrato paling lambat.
  const lajuCuplikHz = (cuplik.length - 1) / durasiDetik;
  const lebarJendela = Math.max(3, Math.round(lajuCuplikHz * 0.4));
  const datar = sen.map((_, i) => {
    let jum = 0;
    let n = 0;
    for (
      let k = Math.max(0, i - lebarJendela);
      k <= Math.min(sen.length - 1, i + lebarJendela);
      k++
    ) {
      jum += sen[k];
      n++;
    }
    return sen[i] - jum / n;
  });

  // Hitung goyangan lewat perpotongan nol arah naik. Untuk gelombang yang
  // bentuknya hampir sinus seperti vibrato, ini lebih tahan gangguan daripada
  // mencari puncak — satu bacaan nyasar tidak bikin puncak palsu.
  const potong: number[] = [];
  for (let i = 1; i < datar.length; i++) {
    if (datar[i - 1] < 0 && datar[i] >= 0) {
      // Perkirakan letak persisnya di antara dua cuplikan.
      const bagian = datar[i] === datar[i - 1] ? 0 : -datar[i - 1] / (datar[i] - datar[i - 1]);
      potong.push(cuplik[i - 1].t + bagian * (cuplik[i].t - cuplik[i - 1].t));
    }
  }

  if (potong.length < 3) {
    return {
      ...kosong,
      durasiDetik,
      midi,
      pusatSen: Math.round(pusatSen),
      cukupData: true,
      alasan: "Nadanya lurus — belum kelihatan ada goyangan vibrato.",
    };
  }

  const periode: number[] = [];
  for (let i = 1; i < potong.length; i++) periode.push(potong[i] - potong[i - 1]);
  const periodeRata = periode.reduce((a, b) => a + b, 0) / periode.length;
  const kecepatanHz = 1000 / periodeRata;

  // Lebar diukur per goyangan, bukan sekali untuk seluruh rekaman: vibrato yang
  // melebar di tengah lalu menyempit lagi harus ketahuan tidak rata, dan itu
  // hilang kalau semuanya dirata-rata sekali.
  const lebarPerGoyangan: number[] = [];
  for (let i = 1; i < potong.length; i++) {
    const a = potong[i - 1];
    const b = potong[i];
    let atas = -Infinity;
    let bawah = Infinity;
    for (let k = 0; k < cuplik.length; k++) {
      if (cuplik[k].t < a || cuplik[k].t > b) continue;
      atas = Math.max(atas, datar[k]);
      bawah = Math.min(bawah, datar[k]);
    }
    if (atas > -Infinity && bawah < Infinity) lebarPerGoyangan.push((atas - bawah) / 2);
  }
  const lebarSen =
    lebarPerGoyangan.reduce((a, b) => a + b, 0) / Math.max(1, lebarPerGoyangan.length);

  return {
    cukupData: true,
    durasiDetik,
    midi,
    pusatSen: Math.round(pusatSen),
    kecepatanHz: Math.round(kecepatanHz * 10) / 10,
    lebarSen: Math.round(lebarSen),
    jumlahGoyangan: periode.length,
    kerataanPeriode: Math.round(simpanganRelatif(periode) * 100) / 100,
    kerataanLebar: Math.round(simpanganRelatif(lebarPerGoyangan) * 100) / 100,
    // Di bawah ±4 sen itu bukan vibrato, cuma nada yang tidak benar-benar diam.
    adaVibrato: lebarSen >= 4,
  };
}
