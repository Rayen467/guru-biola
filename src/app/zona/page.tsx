"use client";

// Zona busur & titik kontak.
//
// Melengkapi /bow, yang mengurus cara MEMEGANG busur. Halaman ini mengurus
// TEMPAT: bagian busur mana yang dipakai, dan seberapa jauh dari bridge.
//
// Kenapa dua-duanya perlu: pegangan yang benar tidak menolong kalau spiccato
// dilatih di ujung busur, karena di ujung busurnya memang tidak akan memantul.

import { useState } from "react";
import Link from "next/link";
import {
  ZONA,
  TITIK_KONTAK,
  TEKNIK,
  SEGITIGA,
  KOREKSI,
  TITIK_SEIMBANG,
} from "@/lib/bowZones";

const WARNA = ["#ef8a5a", "#e0b94a", "#5ec98a", "#5aa8e0", "#a98ae0"];

export default function ZonaPage() {
  const [pilih, setPilih] = useState(ZONA[2].id);
  const [teknik, setTeknik] = useState<string | null>(null);
  const zona = ZONA.find((z) => z.id === pilih) ?? ZONA[2];
  const tk = teknik ? TEKNIK.find((t) => t.id === teknik) ?? null : null;
  const kontakSorot = tk?.titikKontak ?? null;

  const W = 900;
  const H = 120;
  const bowY = 62;
  const kiri = 40;
  const kanan = W - 40;
  const posX = (f: number) => kiri + f * (kanan - kiri);

  return (
    <main className="page-in mx-auto max-w-4xl px-4 py-6">
      <h1 className="title-drift text-2xl font-bold">📏 Zona Busur & Titik Kontak</h1>
      <p className="mt-1 text-sm text-muted">
        Bagian busur mana yang dipakai, dan seberapa jauh dari bridge. Dua hal
        ini yang paling menentukan bunyinya — lebih dari seberapa kuat lu
        nekan.
      </p>

      {/* --- Busur --- */}
      <div className="mt-5 overflow-x-auto rounded-2xl border border-border-soft bg-surface p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px]">
          {ZONA.map((z, i) => {
            const aktif = z.id === pilih || tk?.zona === z.id;
            return (
              <g
                key={z.id}
                onClick={() => {
                  setPilih(z.id);
                  setTeknik(null);
                }}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={posX(z.dari)}
                  y={bowY - 16}
                  width={posX(z.sampai) - posX(z.dari)}
                  height={32}
                  rx={5}
                  fill={WARNA[i]}
                  opacity={aktif ? 0.85 : 0.22}
                  className="transition-all duration-300"
                />
                <text
                  x={(posX(z.dari) + posX(z.sampai)) / 2}
                  y={bowY + 6}
                  textAnchor="middle"
                  fontSize={17}
                  fontWeight={700}
                  fill={aktif ? "#1a1a1a" : "var(--muted)"}
                >
                  {z.huruf}
                </text>
                <text
                  x={(posX(z.dari) + posX(z.sampai)) / 2}
                  y={bowY + 34}
                  textAnchor="middle"
                  fontSize={10}
                  fill={aktif ? "var(--foreground)" : "var(--muted)"}
                >
                  {z.nama.split(" ")[0]}
                </text>
              </g>
            );
          })}

          {/* Busur digambar seperti busur beneran: stick yang sedikit melengkung
              ke dalam, rambut yang lurus, frog bersegi di pangkal, sekrup
              penyetel di belakangnya, dan kepala yang meruncing di ujung. */}
          <path
            d={`M ${kiri - 26} ${bowY - 9} Q ${(kiri + kanan) / 2} ${bowY - 20} ${kanan + 20} ${bowY - 11}`}
            stroke="#8a5a2b"
            strokeWidth={3.4}
            fill="none"
            strokeLinecap="round"
          />
          <line
            x1={kiri - 24}
            y1={bowY - 6}
            x2={kanan + 17}
            y2={bowY - 9}
            stroke="#e8dcc0"
            strokeWidth={3}
            opacity={0.9}
          />
          {/* frog + sekrup penyetel */}
          <rect x={kiri - 32} y={bowY - 12} width={17} height={16} rx={2.5} fill="#2b2b2b" />
          <rect x={kiri - 36} y={bowY - 8} width={5} height={8} rx={1.5} fill="#c9a227" />
          <circle cx={kiri - 24} cy={bowY - 4} r={2} fill="#c9c9c9" />
          {/* kepala busur */}
          <path
            d={`M ${kanan + 16} ${bowY - 14} L ${kanan + 23} ${bowY - 11} L ${kanan + 20} ${bowY - 4} Z`}
            fill="#2b2b2b"
          />
          <text x={kiri - 24} y={bowY - 22} textAnchor="middle" fontSize={9} fill="var(--muted)">
            frog
          </text>
          <text x={kiri - 40} y={bowY + 14} textAnchor="middle" fontSize={8} fill="var(--muted)">
            sekrup
          </text>
          <text x={kanan + 18} y={bowY - 22} textAnchor="middle" fontSize={9} fill="var(--muted)">
            ujung
          </text>

          {/* titik seimbang — penanda yang menentukan spiccato bisa mantul atau tidak */}
          <line
            x1={posX(TITIK_SEIMBANG)}
            y1={bowY - 30}
            x2={posX(TITIK_SEIMBANG)}
            y2={bowY + 18}
            stroke="var(--good)"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
          <text
            x={posX(TITIK_SEIMBANG)}
            y={bowY - 36}
            textAnchor="middle"
            fontSize={10}
            fontWeight={700}
            fill="var(--good)"
          >
            ⚖ titik seimbang — di sini busur mau mantul
          </text>

          {/* berat alami busur: tebal di pangkal, tipis di ujung */}
          <path
            d={`M ${kiri} ${H - 8} L ${kanan} ${H - 8} L ${kanan} ${H - 11} L ${kiri} ${H - 22} Z`}
            fill="var(--accent)"
            opacity={0.35}
          />
          <text x={kiri + 4} y={H - 26} fontSize={9} fill="var(--muted)">
            berat alami busur ↓ makin ke ujung makin ringan
          </text>
        </svg>
      </div>

      {/* --- Rincian zona --- */}
      <div className="animate-fade-up mt-3 rounded-2xl border border-accent/40 bg-surface p-4">
        <h2 className="text-lg font-bold">
          Zona {zona.huruf} — {zona.nama}
        </h2>
        <dl className="mt-2 space-y-2 text-sm">
          <div>
            <dt className="text-xs font-semibold text-muted">Berat alaminya</dt>
            <dd>{zona.beratAlami}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-accent-strong">
              Yang harus dilakukan lengan
            </dt>
            <dd className="font-semibold">{zona.yangDilakukanLengan}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">Dipakai untuk</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {zona.dipakaiUntuk.map((d) => (
                <span key={d} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">
                  {d}
                </span>
              ))}
            </dd>
          </div>
          <div className="rounded-lg bg-bad/10 p-2">
            <dt className="text-xs font-semibold text-bad">Jebakannya</dt>
            <dd className="text-xs">{zona.jebakan}</dd>
          </div>
        </dl>
      </div>

      {/* --- Titik kontak --- */}
      <h2 className="mt-7 text-lg font-bold">Titik kontak — jarak busur ke bridge</h2>
      <p className="mt-1 text-sm text-muted">
        Ini yang hilang dari kebanyakan panduan zona, padahal paling menentukan
        warna bunyi. Nomor 1 mepet bridge, 5 di atas fingerboard.
      </p>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-border-soft bg-surface p-3">
        <svg viewBox="0 0 620 130" className="w-full min-w-[520px]">
          {/* bridge kiri, fingerboard kanan */}
          <rect x={28} y={26} width={9} height={72} fill="var(--foreground)" opacity={0.75} />
          <text x={32} y={116} textAnchor="middle" fontSize={10} fill="var(--muted)">
            bridge
          </text>
          <rect x={500} y={18} width={100} height={88} rx={6} fill="var(--foreground)" opacity={0.18} />
          <text x={550} y={116} textAnchor="middle" fontSize={10} fill="var(--muted)">
            fingerboard
          </text>
          {/* senar */}
          {[38, 54, 70, 86].map((y) => (
            <line key={y} x1={30} y1={y} x2={600} y2={y} stroke="var(--muted)" strokeWidth={1} opacity={0.4} />
          ))}
          {TITIK_KONTAK.map((t, i) => {
            const x = 70 + i * 105;
            const sorot = kontakSorot === t.nomor;
            return (
              <g key={t.nomor}>
                <line
                  x1={x}
                  y1={20}
                  x2={x}
                  y2={104}
                  stroke={sorot ? "var(--good)" : "var(--accent)"}
                  strokeWidth={sorot ? 4 : 2}
                  opacity={sorot ? 1 : 0.5}
                />
                <circle cx={x} cy={14} r={11} fill={sorot ? "var(--good)" : "var(--accent)"} opacity={sorot ? 1 : 0.6} />
                <text x={x} y={18} textAnchor="middle" fontSize={12} fontWeight={700} fill="#1a1a1a">
                  {t.nomor}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {TITIK_KONTAK.map((t) => (
            <div
              key={t.nomor}
              className={`rounded-xl border p-2 text-xs transition ${
                kontakSorot === t.nomor
                  ? "border-good bg-good/10"
                  : "border-border-soft"
              }`}
            >
              <div className="font-semibold">
                {t.nomor}. {t.nama}
              </div>
              <div className="text-muted">{t.jarak}</div>
              <div className="mt-1">
                <b>Butuh:</b> {t.butuh}
              </div>
              <div className="text-muted">{t.hasil}</div>
            </div>
          ))}
        </div>
      </div>

      {/* --- Pemilih teknik --- */}
      <h2 className="mt-7 text-lg font-bold">Mau main teknik apa?</h2>
      <p className="mt-1 text-sm text-muted">
        Pilih tekniknya, nanti ditunjukin zona sama titik kontaknya sekalian.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {TEKNIK.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTeknik(t.id);
              setPilih(t.zona);
            }}
            className={`tekan-pegas rounded-xl border px-3 py-2 text-xs transition ${
              teknik === t.id
                ? "border-accent bg-accent/15 font-semibold"
                : "border-border-soft hover:border-accent/50"
            }`}
          >
            {t.nama}
          </button>
        ))}
      </div>
      {tk && (
        <div className="animate-fade-up mt-3 rounded-2xl border border-good/50 bg-good/5 p-4 text-sm">
          <div className="font-bold">{tk.nama}</div>
          <div className="mt-1 grid gap-1 sm:grid-cols-3">
            <div>
              <span className="text-xs text-muted">Zona</span>
              <div className="font-semibold">
                {ZONA.find((z) => z.id === tk.zona)?.huruf} —{" "}
                {ZONA.find((z) => z.id === tk.zona)?.nama}
              </div>
            </div>
            <div>
              <span className="text-xs text-muted">Titik kontak</span>
              <div className="font-semibold">
                {tk.titikKontak} — {TITIK_KONTAK[tk.titikKontak - 1].nama}
              </div>
            </div>
            <div>
              <span className="text-xs text-muted">Kecepatan busur</span>
              <div className="font-semibold">{tk.kecepatan}</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">{tk.catatan}</p>
        </div>
      )}

      {/* --- Tiga yang bekerja bersamaan --- */}
      <h2 className="mt-7 text-lg font-bold">Tiga hal yang bekerja bersamaan</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {SEGITIGA.map((s) => (
          <div key={s.judul} className="gulir-ungkap rounded-xl border border-border-soft bg-surface p-3 text-xs">
            <div className="font-semibold">{s.judul}</div>
            <div className="mt-1 text-good">↑ {s.naik}</div>
            <div className="mt-0.5 text-muted">↓ {s.turun}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        Mau lebih keras? Jangan cuma ditekan. Percepat busurnya, atau geser
        mendekat ke bridge. Menekan doang cuma bikin senarnya kewalahan dan
        bunyinya jadi kasar —{" "}
        <Link href="/suara" className="text-accent-strong underline">
          halaman Kualitas Suara
        </Link>{" "}
        bisa ngukur itu langsung dari gesekan lu.
      </p>

      {/* --- Koreksi --- */}
      <h2 className="mt-7 text-lg font-bold">⚠️ Yang sering salah di panduan zona</h2>
      <p className="mt-1 text-sm text-muted">
        Panduan zona busur yang beredar sering keliru di titik-titik ini. Bukan
        soal selera — ada alasan fisiknya.
      </p>
      <div className="mt-2 space-y-2">
        {KOREKSI.map((k, i) => (
          <details
            key={i}
            className="gulir-ungkap rounded-xl border border-border-soft bg-surface p-3"
          >
            <summary className="cursor-pointer text-sm font-semibold">
              <span className="text-bad line-through">{k.salah}</span>
            </summary>
            <p className="mt-2 text-sm font-semibold text-good">✅ {k.benar}</p>
            <p className="mt-1 text-xs text-muted">{k.kenapa}</p>
          </details>
        ))}
      </div>

      <p className="mt-6 text-xs text-muted">
        Cara megang busurnya ada di{" "}
        <Link href="/bow" className="text-accent-strong underline">
          Pegang Bow
        </Link>
        . Halaman ini soal di mana busurnya ditaruh, bukan cara memegangnya.
      </p>
    </main>
  );
}
