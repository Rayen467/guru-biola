"use client";

// Pita gelombang yang bergerak mengikuti suara sungguhan.
//
// Bedanya dengan meteran batang yang sudah ada: yang ini bukan hiasan yang
// kebetulan bergerak, tapi gambar dari suaranya sendiri — bentuk gelombangnya,
// bukan cuma kerasnya. Waktu murid menggesek, dia bisa lihat gesekannya rata
// atau bergetar, jauh sebelum angka penilaiannya keluar.
//
// Digambar di canvas, bukan DOM: 60 gambar per detik dengan puluhan titik
// tidak masuk akal kalau tiap titik jadi elemen HTML.

import { useEffect, useRef } from "react";

export default function LiveWave({
  stream,
  active,
  height = 96,
}: {
  stream: MediaStream | null;
  active: boolean;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active || !stream) return;

    const kurangiGerak = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    an.smoothingTimeConstant = 0.72;
    src.connect(an);
    const buf = new Float32Array(new ArrayBuffer(an.fftSize * 4));

    const g = canvas.getContext("2d");
    if (!g) return;

    let raf = 0;
    let jalan = true;
    // Nilai yang dihaluskan antar gambar. Tanpa ini pitanya kedutan, dan
    // kedutan terbaca sebagai "alatnya rusak", bukan sebagai suara.
    let halus: number[] = [];

    // Warna diambil SEKALI dari CSS, bukan tiap gambar.
    //
    // Canvas tidak mengerti var(--accent) — memberikannya ke addColorStop
    // melempar SyntaxError, dan karena lemparannya terjadi di dalam callback
    // requestAnimationFrame, seluruh gambarnya mati diam-diam tanpa pesan apa
    // pun di layar.
    const gaya = getComputedStyle(canvas);
    const ambil = (nama: string, cadangan: string) =>
      gaya.getPropertyValue(nama).trim() || cadangan;
    const warnaAksen = ambil("--accent", "#7aa2f7");
    const warnaBaik = ambil("--good", "#7ad9a1");

    const gambar = () => {
      if (!jalan) return;
      // dpr dibatasi 1,5 dan ukurannya DIBULATKAN sebelum dibandingkan.
      //
      // Tanpa pembulatan, canvas.width (selalu bilangan bulat) tidak akan pernah
      // sama dengan lebar × dpr kalau dpr-nya pecahan — misal 1,25 di Windows
      // dengan penskalaan 125%. Akibatnya canvas dialokasikan ULANG enam puluh
      // kali per detik, memori GPU membengkak, dan akhirnya proses penggambar
      // browser mati: halamannya berubah jadi "This page couldn't load".
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w <= 0 || h <= 0) {
        raf = requestAnimationFrame(gambar);
        return;
      }
      const lebarPiksel = Math.round(w * dpr);
      const tinggiPiksel = Math.round(h * dpr);
      if (canvas.width !== lebarPiksel || canvas.height !== tinggiPiksel) {
        canvas.width = lebarPiksel;
        canvas.height = tinggiPiksel;
      }
      g.setTransform(lebarPiksel / w, 0, 0, tinggiPiksel / h, 0, 0);
      g.clearRect(0, 0, w, h);

      an.getFloatTimeDomainData(buf);

      // Gelombangnya diringkas jadi beberapa puluh titik. Menggambar 2048 titik
      // di lebar 600 piksel cuma menghasilkan garis tebal tak berbentuk.
      const titik = 64;
      const per = Math.floor(buf.length / titik);
      const nilai: number[] = [];
      for (let i = 0; i < titik; i++) {
        let puncak = 0;
        for (let k = 0; k < per; k++) {
          puncak = Math.max(puncak, Math.abs(buf[i * per + k]));
        }
        nilai.push(Math.min(1, puncak * 3.2));
      }
      if (halus.length !== titik) halus = nilai.slice();
      for (let i = 0; i < titik; i++) {
        halus[i] += (nilai[i] - halus[i]) * (kurangiGerak ? 0.12 : 0.34);
      }

      const tengah = h / 2;
      const langkah = w / (titik - 1);

      const gradasi = g.createLinearGradient(0, 0, w, 0);
      gradasi.addColorStop(0, "rgba(120,170,255,0.15)");
      gradasi.addColorStop(0.5, warnaAksen);
      gradasi.addColorStop(1, warnaBaik);

      // Pita: dua sisi cermin, diisi gradasi, lalu garis tepi terang.
      g.beginPath();
      for (let i = 0; i < titik; i++) {
        const x = i * langkah;
        const y = tengah - halus[i] * (tengah - 6);
        if (i === 0) g.moveTo(x, y);
        else {
          const xs = (i - 0.5) * langkah;
          const ys = tengah - ((halus[i - 1] + halus[i]) / 2) * (tengah - 6);
          g.quadraticCurveTo(xs, ys, x, y);
        }
      }
      for (let i = titik - 1; i >= 0; i--) {
        g.lineTo(i * langkah, tengah + halus[i] * (tengah - 6));
      }
      g.closePath();
      g.fillStyle = gradasi;
      g.globalAlpha = 0.32;
      g.fill();
      g.globalAlpha = 1;

      g.beginPath();
      for (let i = 0; i < titik; i++) {
        const x = i * langkah;
        const y = tengah - halus[i] * (tengah - 6);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokeStyle = gradasi;
      g.lineWidth = 2;
      g.lineJoin = "round";
      g.stroke();

      // Garis tengah tipis sebagai patokan diam.
      g.beginPath();
      g.moveTo(0, tengah);
      g.lineTo(w, tengah);
      g.strokeStyle = "rgba(127,127,127,0.28)";
      g.lineWidth = 1;
      g.stroke();

      raf = requestAnimationFrame(gambar);
    };

    // Kalau menggambar melempar, loop-nya berhenti tanpa jejak dan pitanya
    // sekadar diam — kelihatan seperti mic yang tidak menangkap apa-apa.
    // Dibungkus supaya sebabnya tercetak, bukan hilang.
    const gambarAman = () => {
      try {
        gambar();
      } catch (e) {
        jalan = false;
        console.error("LiveWave berhenti:", e);
      }
    };
    gambarAman();

    return () => {
      jalan = false;
      cancelAnimationFrame(raf);
      ctx.close().catch(() => {});
    };
  }, [stream, active]);

  // Canvas baru dibuat saat mic hidup. Kalau dibiarkan ada terus, browser tetap
  // menyiapkan lapisan GPU untuknya padahal tidak ada yang digambar.
  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{ height }}
      className="w-full rounded-xl"
      aria-hidden
    />
  );
}
