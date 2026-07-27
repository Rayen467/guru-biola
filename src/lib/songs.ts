// Lagu untuk mode "ikutin nada" (karaoke biola).
// Nada per frasa biar tampilannya enak dibaca per baris.

export interface SongNote {
  midi: number;
  beats: number; // panjang relatif, buat preview playback
}

export interface Song {
  id: string;
  title: string;
  desc: string;
  level: string;
  phrases: SongNote[][];
}

const n = (midi: number, beats = 1): SongNote => ({ midi, beats });

export const SONGS: Song[] = [
  {
    id: "tangga-a",
    title: "Pemanasan: Tangga Nada A Mayor",
    desc: "Naik lalu turun. Bukan lagu, tapi wajib sebelum lagu.",
    level: "Level 4",
    phrases: [
      [n(69), n(71), n(73), n(74), n(76), n(78), n(80), n(81, 2)],
      [n(81), n(80), n(78), n(76), n(74), n(73), n(71), n(69, 2)],
    ],
  },
  {
    id: "twinkle",
    title: "Twinkle Twinkle Little Star",
    desc: "Lagu pertama semua murid Suzuki. Senar A dan E.",
    level: "Level 5",
    phrases: [
      [n(69), n(69), n(76), n(76), n(78), n(78), n(76, 2)],
      [n(74), n(74), n(73), n(73), n(71), n(71), n(69, 2)],
      [n(76), n(76), n(74), n(74), n(73), n(73), n(71, 2)],
      [n(76), n(76), n(74), n(74), n(73), n(73), n(71, 2)],
      [n(69), n(69), n(76), n(76), n(78), n(78), n(76, 2)],
      [n(74), n(74), n(73), n(73), n(71), n(71), n(69, 2)],
    ],
  },
  {
    id: "lightly-row",
    title: "Lightly Row",
    desc: "Lagu kedua Suzuki. Melatih lompatan jari.",
    level: "Level 5",
    phrases: [
      [n(76), n(73), n(73, 2), n(74), n(71), n(71, 2)],
      [n(69), n(71), n(73), n(74), n(76), n(76), n(76, 2)],
      [n(76), n(73), n(73, 2), n(74), n(71), n(71, 2)],
      [n(69), n(73), n(76), n(76), n(73), n(69), n(69, 2)],
    ],
  },
  {
    id: "ode-to-joy",
    title: "Ode to Joy (Beethoven)",
    desc: "Versi sederhana di senar D dan A. Pelan tapi megah.",
    level: "Level 5-6",
    phrases: [
      [n(66), n(66), n(67), n(69), n(69), n(67), n(66), n(64)],
      [n(62), n(62), n(64), n(66), n(66, 1.5), n(64, 0.5), n(64, 2)],
      [n(66), n(66), n(67), n(69), n(69), n(67), n(66), n(64)],
      [n(62), n(62), n(64), n(66), n(64, 1.5), n(62, 0.5), n(62, 2)],
    ],
  },
];

// Petunjuk senar + jari untuk posisi 1.
// Pilih senar dengan offset terkecil (0-7 semitone dari senar kosong).
const OPEN_STRINGS = [
  { name: "G", midi: 55 },
  { name: "D", midi: 62 },
  { name: "A", midi: 69 },
  { name: "E", midi: 76 },
];

const FINGER_LABEL: Record<number, string> = {
  0: "kosong",
  1: "jari 1 (mundur)",
  2: "jari 1",
  3: "jari 2 (mundur)",
  4: "jari 2",
  5: "jari 3",
  6: "jari 4 (mundur)",
  7: "jari 4",
};

export function fingerHint(midi: number): string {
  let best: { s: string; off: number } | null = null;
  for (const s of OPEN_STRINGS) {
    const off = midi - s.midi;
    if (off >= 0 && off <= 7 && (best === null || off < best.off)) {
      best = { s: s.name, off };
    }
  }
  if (!best) return "di luar posisi 1";
  return `senar ${best.s}, ${FINGER_LABEL[best.off]}`;
}
