// Membaca jawaban AI jadi deretan not biola.
//
// Model bahasa itu tidak bisa dipercaya menghasilkan bentuk yang rapi: kadang
// JSON-nya dibungkus ```json, kadang diberi kalimat pengantar, kadang nadanya
// ditulis "C#5", kadang "Cis5", kadang cuma "C#". Kalau salah satu saja tidak
// ditangani, seluruh hasil gagal dan penggunanya cuma melihat pesan error.
//
// Semua penerjemahan ditaruh di sini, terpisah dari halamannya, supaya bisa
// diuji dengan jawaban-jawaban aneh tanpa perlu memanggil AI sungguhan.

const HURUF: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export interface NotGubahan {
  midi: number;
  beats: number;
}

export interface Gubahan {
  judul: string;
  nadaDasar: string;
  bpm: number;
  ketukPerBirama: number;
  not: NotGubahan[];
  catatan: string;
  peringatan: string[];
}

// Rentang yang benar-benar bisa dimainkan biola. Apa pun di luar ini pasti
// salah, dan lebih baik dibuang daripada ditampilkan sebagai not yang tidak
// mungkin digesek.
const MIDI_MIN = 55; // G3, senar terendah
const MIDI_MAKS = 96; // C7, sudah sangat tinggi tapi masih ada

export function nadaKeMidi(teks: string): number | null {
  const t = teks.trim().replace(/♯/g, "#").replace(/♭/g, "b");
  // "Cis"/"Ces" gaya Belanda kadang muncul karena banyak materi musik
  // Indonesia memakainya.
  const belanda = /^([A-Ga-g])(is|es)?(\d)?$/.exec(t);
  const biasa = /^([A-Ga-g])([#b]?)(\d)?$/.exec(t);
  let huruf: string;
  let ubah = 0;
  let oktaf: number | null = null;

  if (biasa) {
    huruf = biasa[1].toUpperCase();
    ubah = biasa[2] === "#" ? 1 : biasa[2] === "b" ? -1 : 0;
    oktaf = biasa[3] ? Number(biasa[3]) : null;
  } else if (belanda) {
    huruf = belanda[1].toUpperCase();
    ubah = belanda[2] === "is" ? 1 : belanda[2] === "es" ? -1 : 0;
    oktaf = belanda[3] ? Number(belanda[3]) : null;
  } else {
    return null;
  }

  const dasar = HURUF[huruf];
  if (dasar === undefined) return null;
  // Tanpa oktaf, dipakai oktaf 4 — pemanggil yang merapikannya jadi melodi
  // yang menyambung.
  return (( oktaf ?? 4) + 1) * 12 + dasar + ubah;
}

// Mengambil JSON dari jawaban yang mungkin dibungkus penjelasan atau pagar kode.
export function ambilJson(teks: string): unknown | null {
  const tanpaPagar = teks.replace(/```(?:json)?/gi, "");
  const mulai = tanpaPagar.indexOf("{");
  const selesai = tanpaPagar.lastIndexOf("}");
  if (mulai < 0 || selesai <= mulai) return null;
  try {
    return JSON.parse(tanpaPagar.slice(mulai, selesai + 1));
  } catch {
    return null;
  }
}

interface MentahNot {
  nada?: unknown;
  note?: unknown;
  midi?: unknown;
  ketuk?: unknown;
  beats?: unknown;
}

export function bacaGubahan(jawaban: string): Gubahan | null {
  const data = ambilJson(jawaban) as Record<string, unknown> | null;
  if (!data) return null;

  const peringatan: string[] = [];
  const daftar = (data.not ?? data.notes) as MentahNot[] | undefined;
  if (!Array.isArray(daftar) || daftar.length === 0) return null;

  const not: NotGubahan[] = [];
  let sebelum: number | null = null;
  let dibuang = 0;

  for (const m of daftar) {
    let midi: number | null = null;
    if (typeof m.midi === "number") {
      midi = Math.round(m.midi);
    } else {
      const teks = typeof m.nada === "string" ? m.nada : typeof m.note === "string" ? m.note : null;
      if (teks) {
        midi = nadaKeMidi(teks);
        // Nada tanpa angka oktaf: dipilih yang paling dekat dengan nada
        // sebelumnya, supaya melodinya tidak terjun satu oktaf di tengah.
        if (midi != null && !/\d/.test(teks) && sebelum != null) {
          let terbaik = midi;
          for (let o = -3; o <= 3; o++) {
            const calon = midi + o * 12;
            if (Math.abs(calon - sebelum) < Math.abs(terbaik - sebelum)) terbaik = calon;
          }
          midi = terbaik;
        }
      }
    }
    if (midi == null || !Number.isFinite(midi)) {
      dibuang++;
      continue;
    }
    if (midi < MIDI_MIN || midi > MIDI_MAKS) {
      dibuang++;
      continue;
    }

    const ketukMentah = typeof m.ketuk === "number" ? m.ketuk : typeof m.beats === "number" ? m.beats : 1;
    const ketuk = ketukMentah > 0 && ketukMentah <= 8 ? ketukMentah : 1;

    not.push({ midi, beats: ketuk });
    sebelum = midi;
  }

  if (not.length === 0) return null;
  if (dibuang > 0) {
    peringatan.push(
      `${dibuang} not dibuang karena di luar jangkauan biola atau tidak terbaca.`
    );
  }

  const bpm = typeof data.bpm === "number" && data.bpm >= 30 && data.bpm <= 240
    ? Math.round(data.bpm)
    : 90;
  const ketukPerBirama =
    typeof data.ketukPerBirama === "number" && [2, 3, 4, 6].includes(data.ketukPerBirama)
      ? data.ketukPerBirama
      : 4;

  return {
    judul: typeof data.judul === "string" ? data.judul : "Tanpa judul",
    nadaDasar: typeof data.nadaDasar === "string" ? data.nadaDasar : "-",
    bpm,
    ketukPerBirama,
    not,
    catatan: typeof data.catatan === "string" ? data.catatan : "",
    peringatan,
  };
}

export const PROMPT_GUBAH = `Kamu penata musik untuk biola. Tugasmu mengubah lagu jadi satu baris melodi biola yang bisa dilatih.

ATURAN KELUARAN — WAJIB:
- Jawab HANYA dengan JSON. Tanpa kalimat pembuka, tanpa penutup, tanpa pagar kode.
- Bentuknya persis:
{"judul":"...","nadaDasar":"D mayor","bpm":92,"ketukPerBirama":4,"not":[{"nada":"D5","ketuk":1},...],"catatan":"..."}
- "nada" ditulis huruf + tanda + angka oktaf, contoh: "A4", "C#5", "Bb4". Angka oktafnya WAJIB.
- "ketuk" memakai 1 = seperempat. Boleh 0.25, 0.5, 1, 1.5, 2, 3, 4.
- Jumlah ketuk tiap birama harus pas dengan ketukPerBirama.

ATURAN MUSIK:
- Satu nada pada satu waktu. Biola di sini dilatih melodi, bukan akor.
- Rentang aman: G3 sampai E6. Jangan pernah keluar dari itu.
- Utamakan nada dasar yang enak buat biola: D, A, G, C, F, atau Bb mayor.
- Kalau diminta tingkat pemula, jangan keluar dari posisi 1 (G3–B5) dan hindari nada di luar tanda mula.
- Panjang secukupnya: 16 sampai 32 birama, ambil bagian lagu yang paling dikenali.
- "catatan" diisi 1-2 kalimat bahasa Indonesia santai: bagian mana yang diambil dan apa yang perlu diperhatikan saat main.

JUJUR:
- Kalau kamu tidak yakin melodi lagunya, tetap buat versi terbaikmu TAPI tulis di "catatan" bahwa ini perkiraan dan mungkin meleset dari aslinya.`;
