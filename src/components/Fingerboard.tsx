"use client";

// Gambar leher biola dilihat dari depan — nut di atas, makin ke bawah makin
// tinggi nadanya.
//
// Jaraknya BUKAN dikira-kira. Letak tiap nada dihitung dari rumus senar:
//
//     jarak dari nut = panjang senar × (1 − 2^(−semiton/12))
//
// Ini penting justru buat yang mau dilihat: jarak antar jari MENYEMPIT makin
// ke atas. Kalau digambar rata jaraknya, murid akan mengira geser dari posisi 1
// ke 3 itu sejauh dua kali jarak jari 1 ke jari 2 — padahal tidak, dan itu
// persis sumber melesetnya geseran.

const PANJANG_SENAR = 328; // mm, biola ukuran penuh
const SEMITON_MAKS = 15; // sampai kira-kira posisi 5

export const NAMA_SENAR = ["G", "D", "A", "E"];

export interface TitikJari {
  senar: number; // 0 = G, 3 = E
  semiton: number; // 0 = senar kosong
  label: string;
  jenis?: "mulai" | "tujuan" | "biasa";
}

export interface Geseran {
  senar: number;
  dari: number;
  ke: number;
}

// Letak nada ke-n semiton, dinyatakan sebagai pecahan 0..1 dari panjang gambar.
function letak(semiton: number): number {
  const mm = PANJANG_SENAR * (1 - Math.pow(2, -semiton / 12));
  const mmMaks = PANJANG_SENAR * (1 - Math.pow(2, -SEMITON_MAKS / 12));
  return mm / mmMaks;
}

// Posisi tangan: jari 1 tiap posisi jatuh di semiton ke berapa.
const POSISI = [
  { nomor: 1, semiton: 2 },
  { nomor: 3, semiton: 5 },
  { nomor: 5, semiton: 9 },
];

// Tempat stiker huruf yang biasa ditempel di posisi 1 (jari 1, 2, 3, 4).
const STIKER = [2, 4, 5, 7];

export default function Fingerboard({
  titik = [],
  geseran,
  tinggi = 340,
  tampilkanStiker = true,
}: {
  titik?: TitikJari[];
  geseran?: Geseran;
  tinggi?: number;
  tampilkanStiker?: boolean;
}) {
  const W = 200;
  const H = tinggi;
  const atas = 26;
  const bawah = H - 14;
  const kiri = 42;
  const kanan = W - 26;

  const y = (semiton: number) => atas + letak(semiton) * (bawah - atas);
  const x = (senar: number) => kiri + (senar / 3) * (kanan - kiri);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[220px]">
      {/* papan jari */}
      <rect
        x={kiri - 14}
        y={atas}
        width={kanan - kiri + 28}
        height={bawah - atas}
        rx={7}
        fill="var(--foreground)"
        opacity={0.13}
      />

      {/* nut */}
      <rect x={kiri - 16} y={atas - 7} width={kanan - kiri + 32} height={7} rx={2} fill="var(--foreground)" opacity={0.6} />
      <text x={W / 2} y={atas - 12} textAnchor="middle" fontSize={9} fill="var(--muted)">
        nut (senar kosong)
      </text>

      {/* pita posisi */}
      {POSISI.map((p) => (
        <g key={p.nomor}>
          <line
            x1={kiri - 14}
            y1={y(p.semiton)}
            x2={kanan + 14}
            y2={y(p.semiton)}
            stroke="var(--accent)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.5}
          />
          <text x={12} y={y(p.semiton) + 3} fontSize={9} fill="var(--accent-strong)" fontWeight={600}>
            pos {p.nomor}
          </text>
        </g>
      ))}

      {/* senar: makin ke kanan makin tipis, seperti aslinya */}
      {[0, 1, 2, 3].map((s) => (
        <line
          key={s}
          x1={x(s)}
          y1={atas - 6}
          x2={x(s)}
          y2={bawah}
          stroke="var(--foreground)"
          strokeWidth={2.6 - s * 0.5}
          opacity={0.55}
        />
      ))}
      {[0, 1, 2, 3].map((s) => (
        <text key={s} x={x(s)} y={bawah + 12} textAnchor="middle" fontSize={10} fill="var(--muted)">
          {NAMA_SENAR[s]}
        </text>
      ))}

      {/* stiker huruf di posisi 1 — banyak murid menempel ini di biolanya */}
      {tampilkanStiker &&
        STIKER.map((sm) => (
          <rect
            key={sm}
            x={kiri - 14}
            y={y(sm) - 1.6}
            width={kanan - kiri + 28}
            height={3.2}
            fill="var(--good)"
            opacity={0.32}
          />
        ))}

      {/* panah geseran: inilah yang tidak bisa disampaikan tulisan */}
      {geseran && (
        <g>
          <line
            x1={x(geseran.senar) + 15}
            y1={y(geseran.dari)}
            x2={x(geseran.senar) + 15}
            y2={y(geseran.ke)}
            stroke="var(--accent-strong)"
            strokeWidth={2.4}
            markerEnd="url(#ujungPanah)"
          />
          <defs>
            <marker id="ujungPanah" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" fill="var(--accent-strong)" />
            </marker>
          </defs>
          <text
            x={x(geseran.senar) + 20}
            y={(y(geseran.dari) + y(geseran.ke)) / 2}
            fontSize={9}
            fill="var(--accent-strong)"
            fontWeight={700}
          >
            geser
          </text>
        </g>
      )}

      {/* titik jari */}
      {titik.map((t, i) => {
        const warna =
          t.jenis === "tujuan"
            ? "var(--accent-strong)"
            : t.jenis === "mulai"
              ? "var(--good)"
              : "var(--muted)";
        return (
          <g key={i}>
            <circle
              cx={x(t.senar)}
              cy={y(t.semiton)}
              r={11}
              fill={warna}
              opacity={t.jenis === "biasa" ? 0.45 : 1}
              className={t.jenis === "tujuan" ? "animate-pop" : undefined}
            />
            <text
              x={x(t.senar)}
              y={y(t.semiton) + 4}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill="#141414"
            >
              {t.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
