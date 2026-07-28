// Uji mesin deteksi pakai sinyal buatan.
// Jalankan: node --experimental-strip-types scripts/test-detector.mjs
//
// Yang diukur: dari sekian frame audio, berapa persen keputusan detektor benar.
// Sinyal biola  → harus kedeteksi, nadanya tepat (±30 cent).
// Noise/suara lain → harus DITOLAK.
//
// Sinyalnya di-render sekuensial dengan fase yang diakumulasi (bukan
// sin(2π·f(t)·t) yang bikin modulasi frekuensi palsu).

import { ViolinDetector } from "../src/lib/detector.ts";

const SR = 48000;
const SIZE = 4096;
const HOP_MS = 16;
const DURATION_MS = 4000;
const N = Math.ceil((DURATION_MS / 1000) * SR) + SIZE;

function rnd(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}

// Dawai digesek: deret harmonik penuh, sedikit vibrato, plus derik kecil.
function violin(f0, amp = 0.15, { vibrato = 0.004, noise = 0.002 } = {}) {
  const g = rnd(7);
  const partials = [1, 0.7, 0.55, 0.35, 0.25, 0.16, 0.1, 0.07];
  const out = new Float32Array(N);
  let phase = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const f = f0 * (1 + vibrato * Math.sin(2 * Math.PI * 5 * t));
    phase += (2 * Math.PI * f) / SR;
    let v = 0;
    for (let k = 0; k < partials.length; k++) {
      if (f * (k + 1) > SR / 2) break;
      v += partials[k] * Math.sin(phase * (k + 1));
    }
    out[i] = amp * v * 0.35 + noise * g();
  }
  return out;
}

// Biola ASLI lewat mic murahan tidak sebersih model di atas. Tiga hal yang
// bikin deteksi gagal padahal suaranya jelas di kuping:
//   1. mic laptop/HP motong bawah → fundamental G3 (196 Hz) nyaris hilang
//   2. "bridge hill" biola numpuk energi di 2-4 kHz → partial atas malah dominan
//   3. suara dari speaker HP dipotong di bawah ~400 Hz
// Ketiganya bikin "porsi energi di partial 1-2" jadi kecil — padahal ini
// jelas-jelas biola.
function violinShaped(f0, amp, partials, { vibrato = 0.004, noise = 0.003 } = {}) {
  const g = rnd(53);
  const out = new Float32Array(N);
  let phase = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const f = f0 * (1 + vibrato * Math.sin(2 * Math.PI * 5 * t));
    phase += (2 * Math.PI * f) / SR;
    let v = 0;
    for (let k = 0; k < partials.length; k++) {
      if (f * (k + 1) > SR / 2) break;
      v += partials[k] * Math.sin(phase * (k + 1));
    }
    out[i] = amp * v * 0.35 + noise * g();
  }
  return out;
}

// Mic laptop: fundamental tinggal seperempat, partial 2-3 jadi yang terkuat.
const violinWeakFundamental = (f0, amp = 0.14) =>
  violinShaped(f0, amp, [0.22, 1, 0.85, 0.6, 0.45, 0.3, 0.2, 0.12]);

// Senar E / gesekan dekat jembatan: energi numpuk di partial atas.
const violinBright = (f0, amp = 0.12) =>
  violinShaped(f0, amp, [0.3, 0.55, 1, 0.9, 0.7, 0.5, 0.35, 0.2]);

// Rekaman biola diputar dari speaker HP: di bawah ~400 Hz habis dipotong.
const violinFromPhone = (f0, amp = 0.12) =>
  violinShaped(f0, amp, f0 < 400 ? [0.05, 0.35, 1, 0.8, 0.6, 0.4, 0.25, 0.15] : [0.6, 1, 0.8, 0.5, 0.3, 0.2, 0.1, 0.05]);

function whiteNoise(amp = 0.05) {
  const g = rnd(11);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = amp * g();
  return out;
}

// Kipas/AC: dengung rendah + noise pita lebar.
function fanHum(amp = 0.06) {
  const g = rnd(13);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    out[i] =
      amp *
      (0.6 * Math.sin(2 * Math.PI * 50 * t) +
        0.4 * Math.sin(2 * Math.PI * 100 * t) +
        0.25 * Math.sin(2 * Math.PI * 150 * t) +
        0.8 * g());
  }
  return out;
}

// Suara orang ngomong: harmonik juga, tapi f0-nya pindah-pindah tiap suku kata
// dan ada jeda. Ini kasus tersulit — nada tetangga di rentang senar G/D.
function speech(amp = 0.12) {
  const g = rnd(17);
  const out = new Float32Array(N);
  let phase = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const seg = Math.floor(t / 0.16);
    const f = 150 + 70 * Math.sin(seg * 1.7) + 40 * Math.sin(seg * 3.1);
    phase += (2 * Math.PI * f) / SR;
    const gap = Math.floor(t / 0.42) % 3 === 2 ? 0.12 : 1;
    let v = 0;
    for (let k = 1; k <= 6; k++) v += (1 / k) * Math.sin(phase * k);
    out[i] = amp * gap * (v * 0.3 + 0.25 * g());
  }
  return out;
}

// Ketokan / klik metronom: impuls pendek berulang.
function clicks(amp = 0.4) {
  const g = rnd(23);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const phase = (i / SR) % 1;
    const env = phase < 0.02 ? Math.exp(-phase * 260) : 0;
    out[i] = amp * env * g() * 2;
  }
  return out;
}

// Nada dari speaker HP (mis. lagu/YouTube): harmonik tapi nadanya ganti cepat.
function musicFromSpeaker(amp = 0.1) {
  const g = rnd(29);
  const out = new Float32Array(N);
  let phase = 0;
  const scale = [261.6, 293.7, 329.6, 392, 440];
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const f = scale[Math.floor(t / 0.22) % scale.length];
    phase += (2 * Math.PI * f) / SR;
    let v = 0;
    for (let k = 1; k <= 5; k++) v += (1 / k) * Math.sin(phase * k);
    out[i] = amp * (v * 0.3 + 0.15 * g());
  }
  return out;
}

// Vokal manusia ditahan ("aaa…", ketawa, orang nyanyi pelan di ruangan).
// INI kasus yang bikin tuner budeg di dunia nyata: harmonik, jernih, dan
// stabil — beda dari ngomong biasa yang f0-nya meluncur terus. Pembedanya
// cuma satu: formant. Energi puncaknya ketarik ke partial 3-6, bukan 1-2.
function voiceVowel(f0 = 210, amp = 0.14, formants = [700, 1220, 2600]) {
  const g = rnd(31);
  const out = new Float32Array(N);
  const partials = [];
  for (let k = 1; k <= 12; k++) {
    const f = f0 * k;
    // amplop formant: puncak lebar di tiap formant, plus lereng turun -6 dB/okt
    let a = 0.08;
    for (const F of formants) {
      a += 1 / (1 + Math.pow((f - F) / 110, 2));
    }
    partials.push((a * 1) / Math.sqrt(k));
  }
  let phase = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    // sedikit goyang, seperti suara ditahan beneran
    const f = f0 * (1 + 0.006 * Math.sin(2 * Math.PI * 4.5 * t));
    phase += (2 * Math.PI * f) / SR;
    let v = 0;
    for (let k = 0; k < partials.length; k++) {
      if (f * (k + 1) > SR / 2) break;
      v += partials[k] * Math.sin(phase * (k + 1));
    }
    out[i] = amp * v * 0.12 + 0.004 * g();
  }
  return out;
}

// Kipas laptop / dengung trafo yang BERNADA: satu-dua partial doang + desis.
function tonalFan(f0 = 240, amp = 0.09) {
  const g = rnd(37);
  const out = new Float32Array(N);
  let phase = 0;
  for (let i = 0; i < N; i++) {
    phase += (2 * Math.PI * f0) / SR;
    out[i] =
      amp * (Math.sin(phase) + 0.3 * Math.sin(phase * 2) + 0.55 * g());
  }
  return out;
}

// Ketikan keyboard / benda ditaruh di meja.
function typing(amp = 0.3) {
  const g = rnd(41);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const phase = (t * 7) % 1;
    const env = phase < 0.012 ? Math.exp(-phase * 320) : 0;
    out[i] = amp * env * g() * 2;
  }
  return out;
}

function mix(...sigs) {
  const out = new Float32Array(N);
  for (const s of sigs) for (let i = 0; i < N; i++) out[i] += s[i];
  return out;
}

// Di app, sinyal mic lewat dua highpass 165 Hz + lowpass 5 kHz SEBELUM masuk
// detektor (lihat usePitch). Tanpa meniru itu di sini, hasil uji bohong:
// dengung 50 Hz yang di app udah kebuang bakal bikin deteksi meleset di uji.
function biquad(sig, { type, freq, q = 0.707 }) {
  const w0 = (2 * Math.PI * freq) / SR;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  let b0, b1, b2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  if (type === "highpass") {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  }
  const out = new Float32Array(sig.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < sig.length; i++) {
    const x0 = sig[i];
    const y0 =
      (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    out[i] = y0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
  return out;
}

function micChain(sig) {
  let s = biquad(sig, { type: "highpass", freq: 165 });
  s = biquad(s, { type: "highpass", freq: 165 });
  return biquad(s, { type: "lowpass", freq: 5000 });
}

function run(name, rawSignal, { expect, f0 = null, sensitivity = 0.5, skipMs = 1200 }) {
  const signal = micChain(rawSignal);
  const det = new ViolinDetector(SIZE, { sampleRate: SR, sensitivity });
  const buf = new Float32Array(SIZE);
  const frames = Math.floor(DURATION_MS / HOP_MS);
  let judged = 0;
  let correct = 0;
  const reasons = {};

  for (let i = 0; i < frames; i++) {
    const now = i * HOP_MS;
    const start = Math.floor((now / 1000) * SR);
    buf.set(signal.subarray(start, start + SIZE));
    const d = det.process(buf, now);
    reasons[d.reason] = (reasons[d.reason] ?? 0) + 1;
    if (process.env.DEBUG && i % 40 === 0) {
      console.log(
        `   [${now}ms] ${d.reason} raw=${d.rawFreq.toFixed(1)} clar=${d.clarity.toFixed(2)} flat=${d.flatness.toFixed(3)} harm=${d.harmonic.toFixed(2)} lvl=${d.level.toFixed(4)}`
      );
    }

    if (now < skipMs) continue; // lewati kalibrasi + waktu mantap
    judged++;
    if (expect === "detect") {
      if (d.freq !== null && Math.abs(1200 * Math.log2(d.freq / f0)) < 30) correct++;
    } else if (d.freq === null) {
      correct++;
    }
  }

  const pct = judged ? Math.round((correct / judged) * 100) : 0;
  const top = Object.entries(reasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k}:${v}`)
    .join(" ");
  console.log(
    `${pct >= 90 ? "✓" : "✗"} ${name.padEnd(32)} ${String(pct).padStart(3)}%  (${top})`
  );
  return pct;
}

const results = [];
console.log("--- HARUS KEDETEKSI (nada biola) ---");
results.push(run("Senar A 440 Hz", violin(440), { expect: "detect", f0: 440 }));
results.push(run("Senar G 196 Hz", violin(196), { expect: "detect", f0: 196 }));
results.push(run("Senar D 293.7 Hz", violin(293.66), { expect: "detect", f0: 293.66 }));
results.push(run("Senar E 659 Hz", violin(659.26), { expect: "detect", f0: 659.26 }));
results.push(run("Posisi 3 — 1568 Hz", violin(1568), { expect: "detect", f0: 1568 }));
results.push(
  run("Gesekan pelan (amp 0.03)", violin(440, 0.03), { expect: "detect", f0: 440 })
);
results.push(
  run("Vibrato lebar", violin(440, 0.15, { vibrato: 0.012 }), {
    expect: "detect",
    f0: 440,
  })
);
results.push(
  run("Biola + kipas", mix(violin(440), fanHum(0.03)), { expect: "detect", f0: 440 })
);
results.push(
  run("Biola + orang ngomong", mix(violin(587.33, 0.16), speech(0.04)), {
    expect: "detect",
    f0: 587.33,
  })
);

// Kondisi nyata: mic laptop, senar E, dan rekaman dari speaker HP.
results.push(run("Mic laptop — G3 fundamental lemah", violinWeakFundamental(196), { expect: "detect", f0: 196 }));
results.push(run("Mic laptop — D4 fundamental lemah", violinWeakFundamental(293.66), { expect: "detect", f0: 293.66 }));
results.push(run("Mic laptop — A4 fundamental lemah", violinWeakFundamental(440), { expect: "detect", f0: 440 }));
results.push(run("Senar E cerah (partial atas kuat)", violinBright(659.26), { expect: "detect", f0: 659.26 }));
results.push(run("Senar A cerah", violinBright(440), { expect: "detect", f0: 440 }));
results.push(run("Biola dari speaker HP — A4", violinFromPhone(440), { expect: "detect", f0: 440 }));
results.push(run("Biola dari speaker HP — D4", violinFromPhone(293.66), { expect: "detect", f0: 293.66 }));
results.push(run("Biola jauh dari mic (amp 0.012)", violin(440, 0.012), { expect: "detect", f0: 440 }));
results.push(
  run("Mic laptop pelan + noise ruangan", mix(violinWeakFundamental(196, 0.06), whiteNoise(0.004)), {
    expect: "detect",
    f0: 196,
  })
);

console.log("\n--- HARUS DITOLAK (bukan nada biola) ---");
results.push(run("Senyap", new Float32Array(N), { expect: "reject" }));
results.push(run("Noise putih", whiteNoise(0.05), { expect: "reject" }));
results.push(run("Noise putih keras", whiteNoise(0.2), { expect: "reject" }));
results.push(run("Kipas / AC", fanHum(0.08), { expect: "reject" }));
results.push(run("Orang ngomong", speech(0.14), { expect: "reject" }));
results.push(run("Klik metronom", clicks(0.5), { expect: "reject" }));
results.push(
  run("Ketokan + noise ruangan", mix(clicks(0.4), whiteNoise(0.03)), {
    expect: "reject",
  })
);
results.push(run("Musik dari speaker HP", musicFromSpeaker(0.12), { expect: "reject" }));
results.push(run("Vokal ditahan (aaa…)", voiceVowel(210, 0.14), { expect: "reject" }));
results.push(run("Vokal rendah ditahan", voiceVowel(196, 0.16), { expect: "reject" }));
results.push(run("Nyanyi pelan + noise", mix(voiceVowel(330, 0.1), whiteNoise(0.01)), { expect: "reject" }));
results.push(run("Kipas laptop bernada", tonalFan(240, 0.1), { expect: "reject" }));
results.push(run("Ketikan keyboard", typing(0.3), { expect: "reject" }));
results.push(run("Ruangan berisik campur", mix(fanHum(0.05), speech(0.08), typing(0.15)), { expect: "reject" }));
// Batas jujur alat ini: nada dawai yang ditahan LAMA dari speaker (mis. video
// pelajaran biola) memang gak bisa dibedain dari biola beneran — fisikanya
// sama. Yang ketolak itu musik biasa yang gantian nada tiap ketuk.
results.push(
  run("Musik speaker, nada cepat", musicFromSpeaker(0.12), { expect: "reject" })
);

// Profil noise ruangan (ala Krisp): ruangan berisik dipelajari dulu selama
// kalibrasi, baru biolanya masuk. Gesekan pelan di ruangan ber-AC harus tetap
// kebaca, dan ruangannya sendiri harus tetap ditolak walau kenceng.
console.log("\n--- PROFIL NOISE RUANGAN ---");
function afterCalibration(noise, signal, startMs = 1000) {
  const out = new Float32Array(N);
  const startIdx = Math.floor((startMs / 1000) * SR);
  for (let i = 0; i < N; i++) {
    out[i] = noise[i] + (i >= startIdx ? signal[i - startIdx] : 0);
  }
  return out;
}
// Batas fisika, bukan batas kode: kalau noise-nya sama keras atau lebih keras
// dari biolanya (SNR ≤ 0 dB), nada aslinya emang udah ketimbun — peredam
// noise secanggih apa pun cuma bisa nebak. Yang diuji di sini kondisi wajar:
// AC nyala, biola tetap lebih keras dari AC-nya.
results.push(
  run("AC nyala, biola nyusul", afterCalibration(fanHum(0.03), violin(440, 0.08)), {
    expect: "detect",
    f0: 440,
    skipMs: 1600,
  })
);
results.push(run("AC kenceng doang", fanHum(0.12), { expect: "reject" }));
results.push(
  run("Ruangan berisik, orang ngomong nyusul", afterCalibration(fanHum(0.05), voiceVowel(240, 0.16)), {
    expect: "reject",
  })
);

// Ujung-ujung slider sensitivitas juga harus waras.
for (const s of [0, 1]) {
  console.log(`\n--- SENSITIVITAS ${s === 0 ? "PALING KETAT" : "PALING LONGGAR"} ---`);
  results.push(run("Senar A 440 Hz", violin(440), { expect: "detect", f0: 440, sensitivity: s }));
  results.push(
    run("Gesekan pelan (amp 0.03)", violin(440, 0.03), { expect: "detect", f0: 440, sensitivity: s })
  );
  results.push(run("Noise putih", whiteNoise(0.08), { expect: "reject", sensitivity: s }));
  results.push(run("Orang ngomong", speech(0.14), { expect: "reject", sensitivity: s }));
  results.push(run("Kipas / AC", fanHum(0.08), { expect: "reject", sensitivity: s }));
}

const avg = Math.round(results.reduce((a, b) => a + b, 0) / results.length);
console.log(`\nRATA-RATA AKURASI: ${avg}%  (${results.filter((r) => r >= 90).length}/${results.length} kasus lulus ≥90%)`);
process.exitCode = avg >= 90 ? 0 : 1;
