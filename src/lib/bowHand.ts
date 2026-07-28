"use client";

// Penilaian pegangan bow dari titik sendi tangan (21 landmark).
//
// Yang BISA diukur kamera: bentuk tangannya — jempol nekuk apa lurus,
// kelingking bulat apa melorot, jari kaku apa santai, jempol berhadapan sama
// jari tengah apa nggak. Itu justru kesalahan yang paling sering dan paling
// mahal buat pemula.
//
// Yang GAK BISA diukur: seberapa dalam stick nempel di telunjuk (kameranya
// gak lihat batang bow-nya) dan seberapa kenceng lu megang. Dua itu tetap
// perlu mata guru — dan halaman ini ngomong terus terang soal itu.

export interface HandPoint {
  x: number;
  y: number;
  z?: number;
}

// Indeks landmark tangan versi MediaPipe.
export const H = {
  wrist: 0,
  thumbCmc: 1,
  thumbMcp: 2,
  thumbIp: 3,
  thumbTip: 4,
  indexMcp: 5,
  indexPip: 6,
  indexDip: 7,
  indexTip: 8,
  middleMcp: 9,
  middlePip: 10,
  middleDip: 11,
  middleTip: 12,
  ringMcp: 13,
  ringPip: 14,
  ringTip: 16,
  pinkyMcp: 17,
  pinkyPip: 18,
  pinkyDip: 19,
  pinkyTip: 20,
} as const;

export interface HandCheck {
  id: string;
  label: string;
  ok: boolean;
  value: string;
  target: string;
  fix: string;
  weight: number; // seberapa fatal kalau salah
}

export interface HandReading {
  checks: HandCheck[];
  score: number;
  thumbAngle: number;
  pinkyAngle: number;
}

function angle(a: HandPoint, b: HandPoint, c: HandPoint): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

const dist = (a: HandPoint, b: HandPoint) => Math.hypot(a.x - b.x, a.y - b.y);

export function assessHand(lm: HandPoint[]): HandReading {
  const P = (i: number) => lm[i];
  // Ukuran tangan dipakai sebagai satuan, biar jarak kamera gak ngaruh.
  const handSize = dist(P(H.wrist), P(H.middleMcp)) || 1;

  const thumbAngle = angle(P(H.thumbMcp), P(H.thumbIp), P(H.thumbTip));
  const pinkyAngle = angle(P(H.pinkyMcp), P(H.pinkyPip), P(H.pinkyDip));
  const indexAngle = angle(P(H.indexMcp), P(H.indexPip), P(H.indexDip));
  const middleAngle = angle(P(H.middleMcp), P(H.middlePip), P(H.middleDip));
  const spread = dist(P(H.indexMcp), P(H.pinkyMcp)) / handSize;
  const thumbToMiddle = dist(P(H.thumbTip), P(H.middlePip)) / handSize;

  const checks: HandCheck[] = [
    {
      id: "thumb",
      label: "Jempol menekuk",
      ok: thumbAngle < 165,
      value: `${thumbAngle.toFixed(0)}°`,
      target: "Target: di bawah 165° (idealnya 120–155°). 180° = lurus total, itu yang salah.",
      fix: "Jempol lu lurus/ngunci — ini kesalahan nomor satu. Tekuk keluar sampai kuku miring, bikin huruf O sama jari tengah. Jempol itu engsel, bukan penyangga.",
      weight: 3,
    },
    {
      id: "pinky",
      label: "Kelingking melengkung",
      ok: pinkyAngle < 168,
      value: `${pinkyAngle.toFixed(0)}°`,
      target: "Target: nekuk kayak huruf C, di bawah 168°.",
      fix: "Kelingking melorot/lurus. Dia penyeimbang berat bow di pangkal — kalau lurus, berat bow jatuh semua ke senar dan bunyi jadi ngegerus.",
      weight: 3,
    },
    {
      id: "o-shape",
      label: "Jempol berhadapan jari tengah",
      ok: thumbToMiddle < 1.05,
      value: thumbToMiddle.toFixed(2),
      target: "Target: ujung jempol dekat ruas tengah jari tengah (rasio < 1,05).",
      fix: "Jempol lu kejauhan dari jari tengah. Pegangan jadi gak punya poros — geser jempol sampai berhadapan sama jari tengah.",
      weight: 2,
    },
    {
      id: "curved",
      label: "Jari santai melengkung",
      ok: indexAngle < 172 && middleAngle < 172,
      value: `telunjuk ${indexAngle.toFixed(0)}° · tengah ${middleAngle.toFixed(0)}°`,
      target: "Target: dua-duanya melengkung santai, bukan lurus kaku.",
      fix: "Jari lu terlalu lurus. Ingat bentuk tangan pas digantung santai di samping badan — bentuk ITU yang dipakai.",
      weight: 2,
    },
    {
      id: "spread",
      label: "Jarak antar jari wajar",
      ok: spread > 0.42 && spread < 0.95,
      value: spread.toFixed(2),
      target: "Target: 0,42–0,95 (jari agak renggang, gak dempet dan gak mengangkang).",
      fix:
        spread <= 0.42
          ? "Jari terlalu dempet — kontrol jadi sempit. Renggangin dikit, terutama telunjuk ke tengah."
          : "Jari kelebaran — tangan jadi tegang. Rapetin sampai kerasa santai.",
      weight: 1,
    },
  ];

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  return {
    checks,
    score: Math.round((got / total) * 100),
    thumbAngle,
    pinkyAngle,
  };
}

// Latihan "bow hold push-up": dari pegangan normal, jari diluruskan pelan
// sampai bow rebah, terus ditarik balik. Repetisi dihitung dari jempol yang
// bolak-balik antara nekuk dan lurus.
export class PushUpCounter {
  private phase: "bent" | "straight" = "bent";
  reps = 0;

  update(thumbAngle: number): boolean {
    if (this.phase === "bent" && thumbAngle > 172) {
      this.phase = "straight";
      return false;
    }
    if (this.phase === "straight" && thumbAngle < 150) {
      this.phase = "bent";
      this.reps++;
      return true; // satu repetisi kelar
    }
    return false;
  }

  reset() {
    this.reps = 0;
    this.phase = "bent";
  }
}

// Rangka tangan buat digambar di atas video.
export const HAND_BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
