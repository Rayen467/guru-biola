"use client";

// Transkrip pakai model saraf (Basic Pitch dari Spotify).
//
// Kenapa ini beda kelas dari mesin bawaan:
//   - Mesin bawaan itu pelacak nada TUNGGAL. Dia mencari satu pola berulang di
//     gelombang. Begitu ada dua suara bunyi bersamaan, polanya rusak dan dia
//     menebak — itu sebabnya lagu band penuh hasilnya berantakan.
//   - Model ini POLIFONIK. Dilatih dari ribuan rekaman untuk mengenali not
//     yang saling menumpuk, lengkap dengan kapan tiap not MULAI (onset) —
//     bukan cuma "frekuensi apa yang paling menonjol sekarang".
//
// Modelnya cuma 895 KB dan disimpan bareng app ini (public/models/basic-pitch),
// jadi tidak ada permintaan ke CDN, tidak ada API key, dan audionya tidak
// pernah keluar dari perangkat. Yang berat itu waktu hitungnya, bukan unduhnya.
//
// Catatan penting soal masukan: model ini dilatih pada audio 22.050 Hz mono.
// Memberi laju cuplik lain akan menghasilkan nada yang meleset — bukan sedikit,
// tapi sejauh rasio lajunya. Makanya audionya di-resample dulu.

import type { RawNote } from "@/lib/transcribe";

export const BASIC_PITCH_SR = 22050;

export interface AiOptions {
  onProgress?: (pct: number) => void;
  // Ambang seberapa yakin model harus untuk mengakui awal sebuah not.
  // Naikkan kalau hasilnya penuh not sampah; turunkan kalau not aslinya hilang.
  onsetThreshold?: number;
  frameThreshold?: number;
  minNoteLenFrames?: number;
  // Batas nada yang masuk akal; di luar ini hampir pasti bukan melodi.
  minFreq?: number | null;
  maxFreq?: number | null;
}

let modelPath = "";

export function setBasicPitchPath(base: string) {
  modelPath = `${base}/models/basic-pitch/model.json`;
}

export function basicPitchReady(): boolean {
  return modelPath !== "";
}

// Ubah AudioBuffer apa pun jadi mono 22.050 Hz — bentuk yang diminta model.
export async function resampleForModel(buffer: AudioBuffer): Promise<AudioBuffer> {
  const panjang = Math.ceil((buffer.duration * BASIC_PITCH_SR) | 0) || 1;
  const off = new OfflineAudioContext(1, panjang, BASIC_PITCH_SR);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.connect(off.destination);
  src.start();
  return off.startRendering();
}

export interface AiNote extends RawNote {
  amplitude: number; // 0..1 dari model — dipakai buat menebak dinamika
}

export interface Ev {
  startTimeSeconds: number;
  durationSeconds: number;
  pitchMidi: number;
  amplitude: number;
}

// Model ini polifonik: dia melaporkan SEMUA not yang bunyi, termasuk akor
// iringan dan bass. Biola main satu nada pada satu waktu, jadi hasilnya harus
// diperas jadi satu garis melodi.
//
// Dua cara yang SUDAH DICOBA DAN GAGAL — ditulis di sini supaya tidak diulang:
//
//  1. Jalan berurutan not per not, tiap tabrakan ambil yang lebih tinggi.
//     Rusak karena keputusannya cuma melihat satu not sebelumnya; sisa potongan
//     akor yang panjang ikut lolos jadi not palsu.
//  2. Garis waktu, tiap saat ambil NADA TERTINGGI yang bunyi. Terdengar masuk
//     akal ("melodi kan suara paling atas") tapi hasilnya paling parah:
//     A4 B4 C#5 D5 E5 D5 C#5 A4 terbaca "A5 A#4 G#4 B5 A#5 C6 C#6 …" — 0 dari 8.
//     Sebabnya dua: (a) HARMONIK sebuah nada selalu lebih tinggi dari nada
//     aslinya, jadi "tertinggi" justru memilih harmonik, bukan nadanya;
//     (b) model ini juga melaporkan not tetangga selisih satu semiton dengan
//     keyakinan kecil, dan aturan "tertinggi" tidak peduli sekecil apa pun
//     keyakinannya.
//
// Yang dipakai sekarang: pada tiap saat, pilih not yang PALING KUAT (amplitudo
// dari model = seberapa yakin dia). Nada asli selalu lebih kuat dari harmonik
// dan dari tetangga semitonnya, jadi keduanya kalah dengan sendirinya. Lalu:
//   - kelengketan: kalau not yang barusan dipilih masih bunyi dan kekuatannya
//     masih layak, dia dipertahankan — supaya nada panjang tidak pecah-pecah;
//   - penghalus median: kedipan satu-dua langkah dibuang;
//   - baru dikelompokkan jadi not.
const LANGKAH_S = 0.01; // 10 ms — cukup halus untuk not tercepat yang wajar
const NOT_TERPENDEK_S = 0.06; // di bawah ini bukan not, cuma sisa potongan
const AMBANG_KUAT = 0.5; // not dianggap sungguhan kalau ≥ 50% kekuatan terkuat

// Bobot penilaian garis melodi. Angkanya bukan tebakan — disapu menyeluruh
// dengan scripts/test-ai-transcribe.ts terhadap 10 kasus uji.
export const BOBOT = {
  yakin: 1, // seberapa dipercaya keyakinan model
  atas: 0.35, // bonus karena melodi ada di atas iringan (dibatasi satu oktaf)
  dengung: 0.25, // denda kalau not ini mirip dengung ikutan not di bawahnya
  lompat: 0.1, // denda per semiton lompatan (berhenti tumbuh di satu oktaf)
};
const OVERTONE = [12, 19, 24, 28]; // jarak semiton dengung ikutan di atas nada
const BAYANG_MIN_LANGKAH = 15; // 150 ms tertutup = iringan, bukan sambungan legato

// Apakah `atas` cuma dengung ikutan dari salah satu not di bawahnya?
//
// Jarak semiton saja TIDAK CUKUP untuk memutuskan. Melodi yang berjalan di atas
// akor sering kebetulan pas satu oktaf di atas nada akornya — misal melodi C♯5
// di atas akor C♯4 — dan kalau cuma jaraknya yang dilihat, nada melodi aslinya
// ikut terbuang. Itu sudah terjadi dan bikin C♯5 hilang dari hasil.
//
// Pembedanya: dengung ikutan tidak punya gesekan sendiri. Dia lahir bareng
// nada induknya dan hidup sepanjang nada itu. Nada akor yang ditahan 1,5 detik
// tidak sepadan dengan nada melodi 0,6 detik di atasnya — umurnya beda jauh —
// jadi melodinya selamat.
//
// Akhirnya tidak dituntut sama persis: dengung biasanya meluruh lebih dulu dari
// nada induknya. Pernah kejadian dengung A5 mati 140 ms lebih awal dari A4-nya,
// dan aturan "akhirnya harus mirip" meloloskannya jadi not palsu. Yang dituntut
// sekarang: mulainya barengan, umurnya sebanding, dan tidak hidup lebih lama
// dari induknya.
const SEPADAN_S = 0.12;
const UMUR_MIN = 0.6; // dengung menempel ≥60% umur nada induknya

function dengungDari(atas: Ev, daftar: Ev[]): boolean {
  const akhirAtas = atas.startTimeSeconds + atas.durationSeconds;
  return daftar.some((bawah) => {
    if (!OVERTONE.includes(atas.pitchMidi - bawah.pitchMidi)) return false;
    if (bawah.amplitude < atas.amplitude * 0.8) return false;
    if (atas.durationSeconds < bawah.durationSeconds * UMUR_MIN) return false;
    const akhirBawah = bawah.startTimeSeconds + bawah.durationSeconds;
    return (
      Math.abs(bawah.startTimeSeconds - atas.startTimeSeconds) < SEPADAN_S &&
      akhirAtas < akhirBawah + SEPADAN_S
    );
  });
}

export function ambilMelodi(events: Ev[]): Ev[] {
  if (events.length === 0) return [];

  const akhirTotal = Math.max(
    ...events.map((e) => e.startTimeSeconds + e.durationSeconds)
  );
  const jumlahLangkah = Math.ceil(akhirTotal / LANGKAH_S) + 1;

  // Daftar not yang sedang bunyi pada tiap langkah waktu.
  const aktif: Ev[][] = Array.from({ length: jumlahLangkah }, () => []);
  for (const ev of events) {
    const i0 = Math.max(0, Math.round(ev.startTimeSeconds / LANGKAH_S));
    const i1 = Math.min(
      jumlahLangkah - 1,
      Math.round((ev.startTimeSeconds + ev.durationSeconds) / LANGKAH_S)
    );
    for (let i = i0; i <= i1; i++) aktif[i].push(ev);
  }

  // Calon di tiap langkah: not yang cukup kuat untuk dianggap sungguhan.
  // Yang lemah (dengung tipis, tetangga semiton) gugur di sini.
  const calonPer: Ev[][] = aktif.map((daftar) => {
    if (daftar.length === 0) return [];
    let ampMaks = 0;
    for (const ev of daftar) ampMaks = Math.max(ampMaks, ev.amplitude);
    return daftar.filter((ev) => ev.amplitude >= ampMaks * AMBANG_KUAT);
  });

  // === Mencari garis melodi terbaik ===
  //
  // Memilih satu per satu, langkah demi langkah, sudah dicoba dan mentok. Tiga
  // kegagalan terakhir sama sebabnya: pada SATU titik waktu, nada asli dan
  // dengungnya benar-benar tidak bisa dibedakan — dua-duanya kuat, mulai
  // barengan, jaraknya pas satu oktaf. Yang membedakan cuma kelihatan kalau
  // seluruh alurnya dilihat sekaligus: melodi sungguhan berjalan mulus,
  // sedangkan garis yang tercemar dengung melompat satu-dua oktaf bolak-balik.
  //
  // Jadi keputusannya tidak diambil per titik, tapi sekali untuk seluruh lagu:
  // dicari rangkaian nada dengan nilai total terbaik, di mana tiap lompatan
  // besar kena denda. Melodi yang memang melompat oktaf tetap menang — dendanya
  // dibayar sekali, lalu ditutup oleh nilai nada panjang sesudahnya — tapi
  // dengung yang lompat naik-turun terus tidak sanggup membayarnya.
  const nilaiPer: number[][] = [];
  const jejak: number[][] = []; // penunjuk balik ke calon langkah sebelumnya
  let nilaiLalu: number[] = [];
  let calonLalu: Ev[] = [];

  for (let i = 0; i < jumlahLangkah; i++) {
    const calon = calonPer[i];
    const nilai = new Array<number>(calon.length).fill(-Infinity);
    const dari = new Array<number>(calon.length).fill(-1);

    for (let c = 0; c < calon.length; c++) {
      const ev = calon[c];
      const rendah = Math.min(...calon.map((x) => x.pitchMidi));
      // Nilai dasar: seberapa yakin model, ditambah bonus karena melodi hampir
      // selalu suara paling atas, dikurangi denda kalau not ini kelihatan
      // seperti dengung dari not yang ada di bawahnya.
      // Bonus "suara paling atas" DIBATASI satu oktaf. Tanpa batas, bonusnya
      // diukur dari nada terendah yang bunyi — biasanya bass — sehingga not
      // hantu yang nyasar 2½ oktaf di atas bass dapat bonus raksasa dan
      // mengalahkan melodi aslinya. Yang perlu dinyatakan cuma "melodi ada di
      // atas iringan", dan itu sudah tercapai pada jarak satu oktaf.
      const dasar =
        BOBOT.yakin * ev.amplitude +
        BOBOT.atas * Math.min(1, (ev.pitchMidi - rendah) / 12) -
        (dengungDari(ev, aktif[i]) ? BOBOT.dengung : 0);

      let terbaik = dasar;
      let asal = -1;
      for (let p = 0; p < calonLalu.length; p++) {
        if (nilaiLalu[p] === -Infinity) continue;
        // Denda lompatan berhenti tumbuh setelah satu oktaf. Kalau dibiarkan
        // tumbuh terus, jalurnya malah TERJEBAK: begitu satu not palsu yang
        // jauh di atas sempat terpilih, turun kembali ke melodi jadi terlalu
        // mahal, dan sisa nadanya ikut ngaco. Yang ingin dinyatakan cuma
        // "melodi jalannya mulus, jangan loncat-loncat" — lewat satu oktaf,
        // tambahan jaraknya tidak menambah informasi apa pun.
        const lompat = Math.min(12, Math.abs(ev.pitchMidi - calonLalu[p].pitchMidi));
        const skor = nilaiLalu[p] + dasar - BOBOT.lompat * lompat;
        if (skor > terbaik) {
          terbaik = skor;
          asal = p;
        }
      }
      nilai[c] = terbaik;
      dari[c] = asal;
    }

    nilaiPer.push(nilai);
    jejak.push(dari);
    nilaiLalu = nilai;
    calonLalu = calon;
  }

  // Telusuri balik. Lagu punya jeda: di langkah yang sunyi tidak ada calon sama
  // sekali, jadi rantainya memang putus di situ. Putusnya rantai bukan tanda
  // selesai — penelusuran harus lanjut ke belakang dan memulai rantai baru dari
  // pilihan terbaik langkah itu. Versi pertama berhenti begitu rantainya putus,
  // dan hasilnya cuma not terakhir yang selamat dari seluruh lagu.
  const pilihan: (Ev | null)[] = new Array(jumlahLangkah).fill(null);
  const terbaikDi = (i: number) => {
    let b = 0;
    for (let k = 1; k < nilaiPer[i].length; k++) {
      if (nilaiPer[i][k] > nilaiPer[i][b]) b = k;
    }
    return b;
  };
  let langkah = jumlahLangkah - 1;
  let c = -1;
  while (langkah >= 0) {
    if (c < 0) {
      if (calonPer[langkah].length === 0) {
        langkah--;
        continue;
      }
      c = terbaikDi(langkah);
    }
    pilihan[langkah] = calonPer[langkah][c];
    c = jejak[langkah][c];
    langkah--;
  }

  // Berapa lama tiap not tertutup suara yang lebih tinggi, dan sejak langkah
  // ke berapa dia dianggap "not iringan yang lagi nunggu di bawah".
  const lamaKetutup = new Map<Ev, number>();
  const ketutupSejak = new Map<Ev, number>();
  for (let i = 0; i < jumlahLangkah; i++) {
    const pilih = pilihan[i];
    if (!pilih) continue;
    for (const ev of aktif[i]) {
      if (ev === pilih || ev.pitchMidi >= pilih.pitchMidi) continue;
      const n = (lamaKetutup.get(ev) ?? 0) + 1;
      lamaKetutup.set(ev, n);
      if (n === BAYANG_MIN_LANGKAH) ketutupSejak.set(ev, i);
    }
  }

  const halus = pilihan;

  // Gabung langkah-langkah bernada sama jadi satu not.
  const hasil: Ev[] = [];
  let i = 0;
  while (i < jumlahLangkah) {
    const ev = halus[i];
    if (!ev) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < jumlahLangkah && halus[j + 1]?.pitchMidi === ev.pitchMidi) j++;

    const mulai = i * LANGKAH_S;
    const durasi = (j - i + 1) * LANGKAH_S;

    // Buang not iringan yang cuma kelihatan karena melodinya lagi jeda.
    // Tandanya: not ini sudah bunyi dari tadi tertutup nada yang lebih tinggi,
    // lalu muncul begitu nada di atasnya berhenti — dia tidak pernah digesek
    // sebagai nada baru. Nada melodi yang sambung-menyambung (bunyinya sedikit
    // tumpang tindih dengan nada sebelumnya) tidak kena, karena tertutupnya
    // cuma sekejap, jauh di bawah BAYANG_MIN_LANGKAH.
    const sejak = ketutupSejak.get(ev);
    const cumaNongolDiJeda = sejak !== undefined && sejak < i;

    if (durasi >= NOT_TERPENDEK_S && !cumaNongolDiJeda) {
      const sebelum = hasil[hasil.length - 1];
      // Not sama yang cuma terpotong sekejap oleh nada lain — sambung lagi,
      // jangan dilaporkan sebagai dua gesekan.
      if (
        sebelum &&
        sebelum.pitchMidi === ev.pitchMidi &&
        mulai - (sebelum.startTimeSeconds + sebelum.durationSeconds) < 0.05
      ) {
        sebelum.durationSeconds = mulai + durasi - sebelum.startTimeSeconds;
      } else {
        hasil.push({
          startTimeSeconds: mulai,
          durationSeconds: durasi,
          pitchMidi: ev.pitchMidi,
          amplitude: ev.amplitude,
        });
      }
    }
    i = j + 1;
  }
  return hasil;
}

export async function transcribeWithAi(
  buffer: AudioBuffer,
  opts: AiOptions = {}
): Promise<AiNote[]> {
  const audio = await resampleForModel(buffer);
  return transcribeResampled(audio, opts);
}

// Bagian yang benar-benar mengerjakan pengenalan not. Dipisah dari
// transcribeWithAi supaya bisa diuji di luar browser: masukannya boleh
// Float32Array mentah, jadi tidak perlu OfflineAudioContext.
// PENTING: audionya harus SUDAH 22.050 Hz mono.
export async function transcribeResampled(
  audio: AudioBuffer | Float32Array,
  opts: AiOptions = {}
): Promise<AiNote[]> {
  return notesFromEvents(await modelEvents(audio, opts));
}

export function notesFromEvents(events: Ev[]): AiNote[] {
  return ambilMelodi(events).map((ev) => ({
    midi: Math.round(ev.pitchMidi),
    startMs: Math.round(ev.startTimeSeconds * 1000),
    durMs: Math.round(ev.durationSeconds * 1000),
    // Model memberi nada sebagai bilangan bulat MIDI, jadi tidak ada simpangan
    // cent untuk dilaporkan — dan sebarannya nol karena bukan hasil pelacakan
    // per frame. Keyakinan diambil dari amplitudo model, bukan dari kedua ini.
    cents: 0,
    spread: 0,
    db: Math.round(20 * Math.log10(Math.max(0.0005, ev.amplitude))),
    amplitude: ev.amplitude,
  }));
}

// Menjalankan modelnya saja, tanpa memilih melodi. Dipisah karena inilah bagian
// yang mahal (puluhan detik): dengan begini keluarannya bisa disimpan sekali,
// lalu aturan pemilih melodi diuji berkali-kali tanpa menghitung ulang.
export async function modelEvents(
  audio: AudioBuffer | Float32Array,
  opts: AiOptions = {}
): Promise<Ev[]> {
  if (!modelPath) {
    throw new Error("Path model belum diset. Panggil setBasicPitchPath dulu.");
  }
  const {
    onProgress,
    onsetThreshold = 0.5,
    frameThreshold = 0.3,
    minNoteLenFrames = 5,
    minFreq = 130,
    maxFreq = 2100,
  } = opts;

  // Dimuat saat dipakai, bukan saat halaman dibuka: TensorFlow.js besar, dan
  // kebanyakan orang membuka halaman ini tanpa menyentuh mesin AI.
  const {
    BasicPitch,
    outputToNotesPoly,
    addPitchBendsToNoteEvents,
    noteFramesToTime,
  } = await import("@spotify/basic-pitch");

  const model = new BasicPitch(modelPath);

  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];

  await model.evaluateModel(
    audio,
    (f, o, c) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    (pct) => onProgress?.(Math.round(pct * 100))
  );

  return noteFramesToTime(
    addPitchBendsToNoteEvents(
      contours,
      outputToNotesPoly(
        frames,
        onsets,
        onsetThreshold,
        frameThreshold,
        minNoteLenFrames,
        true, // inferOnsets: bantu menemukan awal not yang lembut
        maxFreq,
        minFreq,
        true // melodiaTrick: rapikan not pendek nyasar
      )
    )
  );
}
