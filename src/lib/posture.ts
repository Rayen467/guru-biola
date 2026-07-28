"use client";

// Penilaian postur main biola dari titik-titik badan (pose landmark).
//
// Yang dinilai cuma hal yang memang kelihatan dari kamera depan dan memang
// jadi kesalahan paling umum murid pemula:
//   - kaki rapat / berdiri kaku (harusnya selebar bahu, satu kaki agak maju)
//   - bahu kanan naik pas nggesek (sumber pegal dan bunyi tegang)
//   - badan miring / bertumpu satu kaki
//   - kepala nunduk berlebihan buat "ngunci" biola
//   - lengan kiri jatuh → scroll biola turun (senar G jadi susah dijangkau)
//   - bow gak lurus: pergelangan kanan harusnya jalan di satu garis
//
// Semua diproses di perangkat sendiri. Gambar kamera tidak dikirim ke mana pun.

export interface Point {
  x: number;
  y: number;
  visibility?: number;
}

// Indeks titik badan versi MediaPipe Pose.
export const LM = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export interface CheckResult {
  id: string;
  label: string;
  ok: boolean;
  value: string;
  fix: string;
  // Seperti apa yang BENAR — ditampilkan terus, bukan cuma pas salah.
  // Tanpa ini, user cuma tahu "merah" tapi gak tahu targetnya apa.
  target: string;
  // false = titik badannya gak kelihatan kamera, jadi belum bisa dinilai
  measurable: boolean;
}

export interface PostureReading {
  checks: CheckResult[];
  score: number; // 0..100 dari yang bisa diukur
  bowStraightness: number | null; // 0..1, makin besar makin lurus
  bowSpeedEvenness: number | null; // 0..1
  strokes: number;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const seen = (p: Point | undefined, min = 0.5) =>
  !!p && (p.visibility ?? 1) >= min;

function angleDeg(a: Point, b: Point, c: Point): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag === 0) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

export interface BowTrack {
  points: { x: number; y: number; t: number }[];
}

// Kelurusan bow diukur dari jejak pergelangan tangan kanan: kalau bow-nya
// lurus (sejajar jembatan), pergelangan bergerak di SATU garis. Bow yang
// "nyapu" bikin jejaknya melengkung.
export function analyseBow(track: BowTrack): {
  straightness: number | null;
  evenness: number | null;
  strokes: number;
} {
  const pts = track.points;
  if (pts.length < 12) return { straightness: null, evenness: null, strokes: 0 };

  // Regresi garis lurus (total least squares sederhana lewat PCA 2D).
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  sxx /= n;
  syy /= n;
  sxy /= n;
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);
  let offSq = 0;
  let alongSq = 0;
  for (const p of pts) {
    const dx = p.x - mx;
    const dy = p.y - my;
    const off = dx * nx + dy * ny;
    const along = dx * Math.cos(theta) + dy * Math.sin(theta);
    offSq += off * off;
    alongSq += along * along;
  }
  const spread = Math.sqrt(alongSq / n);
  const wobble = Math.sqrt(offSq / n);
  // Gerakan terlalu kecil = belum nggesek, jangan dinilai
  if (spread < 0.02) return { straightness: null, evenness: null, strokes: 0 };
  const straightness = Math.max(0, Math.min(1, 1 - wobble / (spread * 0.6)));

  // Kerataan kecepatan: makin kecil sebaran laju, makin rata gesekannya.
  const speeds: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i - 1].t;
    if (dt <= 0) continue;
    speeds.push(dist(pts[i], pts[i - 1]) / dt);
  }
  const moving = speeds.filter((s) => s > 0.00005);
  let evenness: number | null = null;
  if (moving.length > 6) {
    const avg = moving.reduce((a, b) => a + b, 0) / moving.length;
    const sd = Math.sqrt(
      moving.reduce((a, b) => a + (b - avg) ** 2, 0) / moving.length
    );
    evenness = Math.max(0, Math.min(1, 1 - sd / (avg || 1)));
  }

  // Hitung ganti arah = jumlah gesekan
  let strokes = 0;
  let lastDir = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const along = dx * Math.cos(theta) + dy * Math.sin(theta);
    const dir = Math.sign(along);
    if (dir !== 0 && Math.abs(along) > 0.004) {
      if (lastDir !== 0 && dir !== lastDir) strokes++;
      lastDir = dir;
    }
  }

  return { straightness, evenness, strokes };
}

export function assess(
  lm: Point[],
  bow: ReturnType<typeof analyseBow>,
  leftHanded = false
): PostureReading {
  const checks: CheckResult[] = [];
  const P = (i: number) => lm[i];

  // Sisi biola (default: biola di bahu KIRI, bow di tangan KANAN)
  const violinSide = leftHanded ? "right" : "left";
  const shoulderV = violinSide === "left" ? P(LM.leftShoulder) : P(LM.rightShoulder);
  const shoulderB = violinSide === "left" ? P(LM.rightShoulder) : P(LM.leftShoulder);
  const wristV = violinSide === "left" ? P(LM.leftWrist) : P(LM.rightWrist);
  const elbowB = violinSide === "left" ? P(LM.rightElbow) : P(LM.leftElbow);
  const wristB = violinSide === "left" ? P(LM.rightWrist) : P(LM.leftWrist);

  const shoulderW =
    seen(P(LM.leftShoulder)) && seen(P(LM.rightShoulder))
      ? dist(P(LM.leftShoulder), P(LM.rightShoulder))
      : 0;

  const add = (
    id: string,
    label: string,
    measurable: boolean,
    ok: boolean,
    value: string,
    fix: string,
    target = ""
  ) => checks.push({ id, label, ok, value, fix, target, measurable });

  // 1. Kuda-kuda kaki
  const anklesSeen = seen(P(LM.leftAnkle), 0.4) && seen(P(LM.rightAnkle), 0.4);
  if (anklesSeen && shoulderW > 0) {
    const ratio = dist(P(LM.leftAnkle), P(LM.rightAnkle)) / shoulderW;
    add(
      "stance",
      "Kuda-kuda kaki",
      true,
      ratio >= 0.7 && ratio <= 1.5,
      `${ratio.toFixed(2)}× lebar bahu`,
      ratio < 0.7
        ? "Kaki kerapatan — badan gampang goyang. Buka selebar bahu, kaki kiri agak maju, berat dibagi rata."
        : "Kaki kelebaran — jadi kaku dan susah muter badan. Kembaliin ke selebar bahu.",
      "Target: 0,7–1,5× lebar bahu (kira-kira selebar bahu, kaki kiri agak maju)"
    );
  } else {
    add("stance", "Kuda-kuda kaki", false, false, "kaki gak kelihatan", "Mundur dikit biar badan sampai kaki masuk frame.");
  }

  // 2. Bahu rata
  if (shoulderW > 0) {
    const tilt = Math.abs(P(LM.leftShoulder).y - P(LM.rightShoulder).y) / shoulderW;
    const bahuNaik =
      P(shoulderB === P(LM.rightShoulder) ? LM.rightShoulder : LM.leftShoulder).y <
      P(shoulderV === P(LM.leftShoulder) ? LM.leftShoulder : LM.rightShoulder).y;
    add(
      "shoulders",
      "Bahu rata",
      true,
      tilt < 0.09,
      `beda tinggi ${(tilt * 100).toFixed(0)}%`,
      bahuNaik
        ? "Bahu tangan bow naik. Ini sumber pegal dan bunyi tegang — turunin bahu, biarin lengan gantung dari sendi bahu."
        : "Bahu penyangga biola naik. Jangan diangkat buat ngejepit biola; kalau perlu, tinggiin shoulder rest.",
      "Target: beda tinggi dua bahu di bawah 9% lebar bahu (praktisnya: sejajar)"
    );
  } else {
    add("shoulders", "Bahu rata", false, false, "bahu gak kelihatan", "Hadap kamera, jarak 2-3 meter.");
  }

  // 3. Badan tegak (bukan bertumpu satu kaki)
  if (
    shoulderW > 0 &&
    seen(P(LM.leftHip), 0.4) &&
    seen(P(LM.rightHip), 0.4)
  ) {
    const shoulderMid = (P(LM.leftShoulder).x + P(LM.rightShoulder).x) / 2;
    const hipMid = (P(LM.leftHip).x + P(LM.rightHip).x) / 2;
    const lean = Math.abs(shoulderMid - hipMid) / shoulderW;
    add(
      "torso",
      "Badan tegak",
      true,
      lean < 0.18,
      `miring ${(lean * 100).toFixed(0)}%`,
      "Badan condong ke satu sisi — biasanya karena berat numpu di satu kaki. Bagi berat rata, bayangin ada tali narik ubun-ubun ke atas.",
      "Target: tengah bahu segaris sama tengah pinggang (miring < 18%)"
    );
  } else {
    add("torso", "Badan tegak", false, false, "pinggang gak kelihatan", "Mundur dikit dari kamera.");
  }

  // 4. Kepala: miring wajar buat megang biola, tapi jangan nunduk nempel
  if (seen(P(LM.leftEar), 0.4) && seen(P(LM.rightEar), 0.4) && shoulderW > 0) {
    const headTilt =
      (Math.abs(P(LM.leftEar).y - P(LM.rightEar).y) / shoulderW) * 100;
    add(
      "head",
      "Kepala & dagu",
      true,
      headTilt < 22,
      `miring ${headTilt.toFixed(0)}%`,
      "Kepala terlalu nunduk/miring — itu tanda biola dijepit pakai leher. Biola disangga tulang selangka + dagu SANTAI. Kalau melorot terus, shoulder rest-nya yang kurang tinggi.",
      "Target: miring < 22%. Miring dikit ke kiri itu normal dan memang perlu; yang salah kalau kepala menekan buat ngunci biola"
    );
  } else {
    add("head", "Kepala & dagu", false, false, "wajah gak kelihatan", "Hadap kamera.");
  }

  // 5. Lengan kiri: scroll jangan turun
  if (seen(wristV, 0.4) && seen(shoulderV, 0.4) && shoulderW > 0) {
    const drop = (wristV.y - shoulderV.y) / shoulderW;
    add(
      "scroll",
      "Tinggi biola (scroll)",
      true,
      drop < 0.55,
      `pergelangan ${drop > 0 ? "+" : ""}${(drop * 100).toFixed(0)}% di bawah bahu`,
      "Scroll biolanya turun. Angkat lengan kiri sampai biola nyaris sejajar lantai — kalau nunduk, senar G susah dijangkau dan bow gampang lari ke fingerboard.",
      "Target: pergelangan kiri gak lebih dari 55% lebar bahu di bawah garis bahu — scroll setinggi hidung atau lebih"
    );
  } else {
    add("scroll", "Tinggi biola (scroll)", false, false, "lengan kiri gak kelihatan", "Pastikan lengan kiri masuk frame.");
  }

  // 6. Siku kanan (lengan bow) jangan ngangkat/nempel badan
  if (seen(shoulderB, 0.4) && seen(elbowB, 0.4) && seen(wristB, 0.4)) {
    const armAngle = angleDeg(shoulderB, elbowB, wristB);
    add(
      "bowarm",
      "Sudut siku tangan bow",
      true,
      armAngle > 65 && armAngle < 165,
      `${armAngle.toFixed(0)}°`,
      armAngle <= 65
        ? "Siku ketekuk terlalu rapat — bow jadi pendek dan bunyinya nyekik. Buka lengan, pakai bow sampai ujung."
        : "Lengan terlalu lurus/terkunci. Sikunya harus ikut nekuk pas bow balik ke pangkal.",
      "Target: 65°–165°. Wajar berubah sepanjang gesekan — nekuk di pangkal bow, lurus di ujung"
    );
  } else {
    add("bowarm", "Sudut siku tangan bow", false, false, "lengan bow gak kelihatan", "Miringin badan dikit biar tangan bow kelihatan kamera.");
  }

  // 7. Kelurusan bow
  if (bow.straightness !== null) {
    add(
      "bowline",
      "Bow lurus (sejajar jembatan)",
      true,
      bow.straightness > 0.62,
      `${Math.round(bow.straightness * 100)}%`,
      "Jejak pergelangan lu melengkung — bow-nya 'nyapu', bukan lurus. Latihan depan cermin: bayangin bow jalan di rel, jarak ke jembatan tetap sama dari pangkal sampai ujung.",
      "Target: di atas 62%. Artinya pergelangan jalan di satu garis, bukan busur"
    );
  } else {
    add("bowline", "Bow lurus (sejajar jembatan)", false, false, "belum ada gesekan", "Gesek beberapa kali panjang-panjang.");
  }

  // 8. Kerataan kecepatan bow
  if (bow.evenness !== null) {
    add(
      "bowspeed",
      "Kecepatan bow rata",
      true,
      bow.evenness > 0.55,
      `${Math.round(bow.evenness * 100)}%`,
      "Kecepatan bow naik-turun — biasanya ngebut di tengah, ngerem di ujung. Hitung 4 ketuk per gesekan, jaga lajunya sama dari pangkal ke ujung.",
      "Target: di atas 55%. Laju bow rata dari pangkal sampai ujung"
    );
  } else {
    add("bowspeed", "Kecepatan bow rata", false, false, "belum ada gesekan", "Gesek dulu beberapa kali.");
  }

  const measurable = checks.filter((c) => c.measurable);
  const score = measurable.length
    ? Math.round((measurable.filter((c) => c.ok).length / measurable.length) * 100)
    : 0;

  return {
    checks,
    score,
    bowStraightness: bow.straightness,
    bowSpeedEvenness: bow.evenness,
    strokes: bow.strokes,
  };
}
