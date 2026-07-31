"use client";

// Penggambar paranada kunci G.
//
// Digambar manual pakai SVG, bukan font musik: glyph musik sering tidak ada di
// Windows dan berubah jadi kotak.
//
// Versi pertama cuma menaruh bulatan berjajar rata di lima garis, dan itu
// membuat partiturnya ambigu di tiga hal sekaligus — tidak ada garis birama
// (ketukan berat tidak ketahuan), tidak ada tanda mula (tiap F♯ ditulisi kres
// satu per satu), dan semua not bentuknya sama (seperempat dan seperdelapan
// tidak bisa dibedakan sama sekali). Sekarang aturan penulisannya dihitung di
// lib/notation.ts, dan di sini tinggal digambar.

import {
  tataPartitur,
  letakTandaMula,
  langkahDari,
  namaTanda,
  type NotMasuk,
  type NotTata,
} from "@/lib/notation";

export type { NotMasuk as StaffNote };

// Dipakai halaman lain untuk menaruh sesuatu sejajar dengan not.
export function staffStep(midi: number): { step: number; sharp: boolean } {
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  const name = NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { step: LETTERS.indexOf(name[0]) + 7 * octave, sharp: name.length > 1 };
}

const SP = 11; // jarak antar garis paranada
const GARIS_BAWAH = langkahDari(2, 4); // E4
const GARIS_ATAS = langkahDari(3, 5); // F5
const TENGAH = langkahDari(6, 4); // B4 — penentu arah tangkai

export default function Staff({
  notes,
  current = -1,
  done = -1,
  perRow = 8,
  labels,
  bowMarks,
  dyns,
  beatsPerBar = 4,
  barsPerRow,
  showBarNumbers = true,
}: {
  notes: NotMasuk[];
  current?: number;
  done?: number;
  perRow?: number;
  labels?: string[];
  bowMarks?: string[];
  dyns?: (string | null)[];
  beatsPerBar?: number;
  barsPerRow?: number;
  showBarNumbers?: boolean;
}) {
  if (notes.length === 0) return null;
  const tata = tataPartitur(notes, { ketukPerBirama: beatsPerBar });

  // Baris dipatah di GARIS BIRAMA, tidak pernah di tengah birama. Memotong
  // birama jadi dua baris adalah salah satu hal yang paling bikin partitur
  // susah dibaca.
  const perBaris = barsPerRow ?? Math.max(1, Math.round(perRow / beatsPerBar));
  const baris: NotTata[][] = [];
  let kini: NotTata[] = [];
  let biramaAwal = tata.not[0]?.birama ?? 1;
  for (const n of tata.not) {
    if (kini.length > 0 && n.birama - biramaAwal >= perBaris && n.awalBirama) {
      baris.push(kini);
      kini = [];
      biramaAwal = n.birama;
    }
    kini.push(n);
  }
  if (kini.length) baris.push(kini);

  let mulaiIdx = 0;
  return (
    <div className="space-y-1">
      {baris.map((row, r) => {
        const idx0 = mulaiIdx;
        mulaiIdx += row.length;
        return (
          <BarisParanada
            key={r}
            row={row}
            idx0={idx0}
            current={current}
            done={done}
            labels={labels}
            bowMarks={bowMarks}
            dyns={dyns}
            kres={tata.kres}
            beatsPerBar={beatsPerBar}
            tampilkanKepala={r === 0}
            showBarNumbers={showBarNumbers}
            terakhir={r === baris.length - 1}
          />
        );
      })}
    </div>
  );
}

function BarisParanada({
  row,
  idx0,
  current,
  done,
  labels,
  bowMarks,
  dyns,
  kres,
  beatsPerBar,
  tampilkanKepala,
  showBarNumbers,
  terakhir,
}: {
  row: NotTata[];
  idx0: number;
  current: number;
  done: number;
  labels?: string[];
  bowMarks?: string[];
  dyns?: (string | null)[];
  kres: number;
  beatsPerBar: number;
  tampilkanKepala: boolean;
  showBarNumbers: boolean;
  terakhir: boolean;
}) {
  // Pita yang tidak boleh saling masuk: tanda bow di atas, paranada di tengah,
  // dinamika lalu label di bawah.
  const ATAS = 34;
  const TINGGI_STAF = SP * 4;
  const yBawah = ATAS + TINGGI_STAF;
  const BAWAH = 46;
  const Y_DYN = yBawah + BAWAH + 12;
  const Y_LABEL = Y_DYN + 19;
  const H = Y_LABEL + 8;

  const yOf = (langkah: number) => yBawah - (langkah - GARIS_BAWAH) * (SP / 2);

  // Kunci dan tanda mula makan tempat di awal baris.
  const jumlahTanda = Math.min(7, Math.abs(kres));
  const lebarKunci = 34;
  const lebarTanda = jumlahTanda * 9;
  const lebarBirama = tampilkanKepala ? 26 : 0;
  const kiri = 14 + lebarKunci + lebarTanda + lebarBirama + 10;

  // Lebar tiap not sebanding dengan panjangnya, tapi tidak lurus: not empat
  // ketuk tidak perlu delapan kali lebar not setengah ketuk, nanti barisnya
  // kosong melompong. Pangkat 0,6 itu yang lazim dipakai penata partitur.
  const bobot = row.map((n) => Math.pow(Math.max(0.125, n.ketuk), 0.6));
  const totalBobot = bobot.reduce((a, b) => a + b, 0);
  const LEBAR_ISI = Math.max(380, totalBobot * 62);
  const W = kiri + LEBAR_ISI + 24;

  const x: number[] = [];
  {
    let jalan = 0;
    for (let i = 0; i < row.length; i++) {
      // Not digeser ke tengah jatah lebarnya sendiri.
      x.push(kiri + (jalan + bobot[i] * 0.42) * (LEBAR_ISI / totalBobot));
      jalan += bobot[i];
    }
  }
  const xGaris = (i: number) =>
    kiri +
    (bobot.slice(0, i).reduce((a, b) => a + b, 0) * LEBAR_ISI) / totalBobot -
    9;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* Paranadanya ditarik dari kiri ke kanan, satu per satu dari bawah.
          Bukan sekadar hiasan: matanya jadi ikut menyapu ke arah baca. */}
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1={14}
          y1={yBawah - i * SP}
          x2={W - 14}
          y2={yBawah - i * SP}
          stroke="var(--foreground)"
          strokeWidth="1"
          opacity="0.55"
          className="gambar"
          style={
            {
              "--panjang": W,
              "--tunda": `${i * 55}ms`,
            } as React.CSSProperties
          }
        />
      ))}

      <KunciG x={16} yG={yOf(langkahDari(4, 4))} />

      {letakTandaMula(kres).map((langkah, i) => (
        <g key={i} transform={`translate(${14 + lebarKunci + i * 9}, ${yOf(langkah)})`}>
          {kres > 0 ? <Kres /> : <Mol />}
        </g>
      ))}

      {tampilkanKepala && (
        <TandaBirama
          x={14 + lebarKunci + lebarTanda + 10}
          yTengah={yOf(TENGAH)}
          atas={beatsPerBar}
          bawah={4}
        />
      )}

      {/* garis birama */}
      {row.map((n, i) =>
        n.awalBirama && i > 0 ? (
          <line
            key={`bar${i}`}
            x1={xGaris(i)}
            y1={yBawah - TINGGI_STAF}
            x2={xGaris(i)}
            y2={yBawah}
            stroke="var(--foreground)"
            strokeWidth="1.1"
            opacity="0.6"
          />
        ) : null
      )}
      {showBarNumbers &&
        row.map((n, i) =>
          n.awalBirama ? (
            <text
              key={`no${i}`}
              x={i === 0 ? kiri - 6 : xGaris(i) + 3}
              y={yBawah - TINGGI_STAF - 8}
              fontSize={9}
              fill="var(--muted)"
              fontFamily="ui-serif, Georgia, serif"
            >
              {n.birama}
            </text>
          ) : null
        )}

      {/* garis penutup baris: tipis lalu tebal, seperti akhir bagian */}
      {terakhir ? (
        <>
          <line
            x1={W - 22}
            y1={yBawah - TINGGI_STAF}
            x2={W - 22}
            y2={yBawah}
            stroke="var(--foreground)"
            strokeWidth="1.1"
            opacity="0.6"
          />
          <rect
            x={W - 18}
            y={yBawah - TINGGI_STAF}
            width={4}
            height={TINGGI_STAF}
            fill="var(--foreground)"
            opacity="0.75"
          />
        </>
      ) : (
        <line
          x1={W - 14}
          y1={yBawah - TINGGI_STAF}
          x2={W - 14}
          y2={yBawah}
          stroke="var(--foreground)"
          strokeWidth="1.1"
          opacity="0.6"
        />
      )}

      <Balok row={row} x={x} yOf={yOf} />

      {row.map((n, i) => {
        const idx = idx0 + i;
        const aktif = idx === current;
        const sudah = idx <= done;
        const warna = aktif
          ? "var(--accent-strong)"
          : sudah
            ? "var(--good)"
            : "var(--foreground)";
        return (
          <g key={idx} className={aktif ? "animate-pop" : undefined}>
            {n.rest ? (
              <Istirahat n={n} x={x[i]} yTengah={yOf(TENGAH)} warna={warna} />
            ) : (
              <Not
                n={n}
                x={x[i]}
                y={yOf(n.langkah)}
                yOf={yOf}
                warna={warna}
                dibalok={n.grupBalok >= 0}
              />
            )}
            {aktif && (
              <circle
                cx={x[i]}
                cy={n.rest ? yOf(TENGAH) : yOf(n.langkah)}
                r={15}
                fill="none"
                stroke="var(--accent-strong)"
                strokeWidth="1.4"
                className="ping-once"
              />
            )}
            {bowMarks?.[idx] && !n.rest && (
              <text
                x={x[i]}
                y={ATAS - 14}
                fontSize={14}
                fontWeight={700}
                fill={aktif ? "var(--accent-strong)" : "var(--muted)"}
                textAnchor="middle"
              >
                {bowMarks[idx]}
              </text>
            )}
            {dyns?.[idx] && (
              <text
                x={x[i]}
                y={Y_DYN}
                fontSize={15}
                fontStyle="italic"
                fontWeight={700}
                fontFamily="ui-serif, Georgia, serif"
                fill="var(--accent)"
                textAnchor="middle"
              >
                {dyns[idx]}
              </text>
            )}
            {labels?.[idx] && !n.rest && (
              <text
                x={x[i]}
                y={Y_LABEL}
                fontSize={12.5}
                fontWeight={aktif ? 700 : 500}
                fill={aktif ? "var(--accent-strong)" : "var(--muted)"}
                textAnchor="middle"
              >
                {labels[idx]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Kunci G. Digambar sebagai satu goresan: lingkaran spiral yang memusat di
// garis G, batang yang naik melewati paranada, lalu kait ke bawah. Bukan
// tiruan persis font musik, tapi bentuknya jelas kunci G — jauh lebih baik
// daripada versi sebelumnya yang cuma lingkaran berisi huruf "G".
function KunciG({ x, yG }: { x: number; yG: number }) {
  const titik: string[] = [];
  const putaran = 1.65;
  const langkah = 46;
  for (let i = 0; i <= langkah; i++) {
    const t = i / langkah;
    const sudut = -Math.PI * 0.55 + t * putaran * 2 * Math.PI;
    const jari = SP * (1.62 - 1.28 * t);
    titik.push(`${(x + 13 + jari * Math.cos(sudut)).toFixed(2)},${(yG + jari * Math.sin(sudut)).toFixed(2)}`);
  }
  const awal = titik[0];
  const [ax, ay] = awal.split(",").map(Number);
  return (
    <g
      stroke="var(--foreground)"
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      opacity="0.85"
      className="gambar"
      style={{ "--panjang": 260, "--tunda": "180ms" } as React.CSSProperties}
    >
      <polyline points={titik.join(" ")} />
      {/* batang naik dari pangkal spiral, melengkung ke puncak di atas paranada */}
      <path d={`M ${ax} ${ay} C ${ax + 10} ${ay - SP * 1.9}, ${x + 21} ${yG - SP * 3.4}, ${x + 14} ${yG - SP * 3.9}`} />
      {/* batang turun menembus paranada lalu mengait ke kiri */}
      <path
        d={`M ${x + 13} ${yG - SP * 0.2} L ${x + 13} ${yG + SP * 2.5} C ${x + 13} ${yG + SP * 3.5}, ${x + 4} ${yG + SP * 3.5}, ${x + 5} ${yG + SP * 2.6}`}
      />
    </g>
  );
}

function Kres() {
  return (
    <g stroke="var(--foreground)" strokeLinecap="round" opacity="0.85">
      <line x1={2} y1={-7} x2={2} y2={6} strokeWidth={1.3} />
      <line x1={6} y1={-8} x2={6} y2={5} strokeWidth={1.3} />
      <line x1={-1} y1={-2} x2={9} y2={-4} strokeWidth={2.2} />
      <line x1={-1} y1={3} x2={9} y2={1} strokeWidth={2.2} />
    </g>
  );
}

function Mol() {
  return (
    <g stroke="var(--foreground)" fill="none" opacity="0.85">
      <line x1={2} y1={-9} x2={2} y2={5} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M 2 0 C 6 -3, 9 1, 5 4 C 4 4.8, 3 5, 2 5" strokeWidth={1.6} />
    </g>
  );
}

function TandaBirama({
  x,
  yTengah,
  atas,
  bawah,
}: {
  x: number;
  yTengah: number;
  atas: number;
  bawah: number;
}) {
  const gaya = {
    fontSize: 20,
    fontWeight: 700,
    fontFamily: "ui-serif, Georgia, serif",
    fill: "var(--foreground)",
    textAnchor: "middle" as const,
    opacity: 0.85,
  };
  return (
    <g>
      <text x={x} y={yTengah - 2} {...gaya}>
        {atas}
      </text>
      <text x={x} y={yTengah + 18} {...gaya}>
        {bawah}
      </text>
    </g>
  );
}

const TANGKAI = SP * 3.4;

function arahTangkaiNaik(n: NotTata) {
  return n.langkah < TENGAH;
}

function Not({
  n,
  x,
  y,
  yOf,
  warna,
  dibalok,
}: {
  n: NotTata;
  x: number;
  y: number;
  yOf: (l: number) => number;
  warna: string;
  dibalok: boolean;
}) {
  const berongga = n.nilai === "penuh" || n.nilai === "setengah";
  const adaTangkai = n.nilai !== "penuh";
  const naik = arahTangkaiNaik(n);
  const rx = n.nilai === "penuh" ? 8.2 : 7;
  const ry = 5.2;

  // Garis bantu untuk not di luar paranada.
  const bantu: number[] = [];
  for (let k = GARIS_BAWAH - 2; k >= n.langkah; k -= 2) bantu.push(k);
  for (let k = GARIS_ATAS + 2; k <= n.langkah; k += 2) bantu.push(k);

  const xT = naik ? x + rx - 0.6 : x - rx + 0.6;
  const yT = naik ? y - TANGKAI : y + TANGKAI;

  // Titik penambah panjang ditaruh di SPASI, bukan di garis — kalau not-nya
  // duduk di garis, titiknya digeser satu setengah spasi ke atas.
  const diGaris = (n.langkah - GARIS_BAWAH) % 2 === 0;
  const yTitik = diGaris ? y - SP / 2 : y;

  return (
    <>
      {bantu.map((k) => (
        <line
          key={k}
          x1={x - 12}
          y1={yOf(k)}
          x2={x + 12}
          y2={yOf(k)}
          stroke={warna}
          strokeWidth="1.2"
        />
      ))}
      {n.aksidental && (
        <g transform={`translate(${x - 21}, ${y})`}>
          {n.aksidental === "♯" ? <Kres /> : n.aksidental === "♭" ? <Mol /> : <Pugar />}
        </g>
      )}
      <ellipse
        cx={x}
        cy={y}
        rx={rx}
        ry={ry}
        fill={berongga ? "none" : warna}
        stroke={warna}
        strokeWidth={berongga ? 1.9 : 0.8}
        transform={`rotate(-18 ${x} ${y})`}
      />
      {n.titik > 0 && <circle cx={x + rx + 5} cy={yTitik} r={1.8} fill={warna} />}
      {adaTangkai && (
        <line x1={xT} y1={y} x2={xT} y2={yT} stroke={warna} strokeWidth={1.6} />
      )}
      {adaTangkai && !dibalok && (n.nilai === "seperdelapan" || n.nilai === "seperenambelas") && (
        <Bendera x={xT} y={yT} naik={naik} ganda={n.nilai === "seperenambelas"} warna={warna} />
      )}
    </>
  );
}

function Pugar() {
  return (
    <g stroke="var(--foreground)" strokeLinecap="round" opacity="0.85">
      <line x1={1} y1={-8} x2={1} y2={4} strokeWidth={1.3} />
      <line x1={6} y1={-4} x2={6} y2={8} strokeWidth={1.3} />
      <line x1={1} y1={-2.5} x2={6} y2={-4} strokeWidth={2} />
      <line x1={1} y1={2.5} x2={6} y2={1} strokeWidth={2} />
    </g>
  );
}

function Bendera({
  x,
  y,
  naik,
  ganda,
  warna,
}: {
  x: number;
  y: number;
  naik: boolean;
  ganda: boolean;
  warna: string;
}) {
  const arah = naik ? 1 : -1;
  const bikin = (geser: number) =>
    `M ${x} ${y + geser * arah} C ${x + 8} ${y + (geser + 5) * arah}, ${x + 9} ${y + (geser + 12) * arah}, ${x + 3} ${y + (geser + 17) * arah}`;
  return (
    <g stroke={warna} fill="none" strokeWidth={2} strokeLinecap="round">
      <path d={bikin(0)} />
      {ganda && <path d={bikin(6)} />}
    </g>
  );
}

// Balok penyambung tangkai. Arahnya diputuskan untuk SATU grup sekaligus —
// kalau tiap not memutuskan sendiri, baloknya patah-patah naik turun.
function Balok({
  row,
  x,
  yOf,
}: {
  row: NotTata[];
  x: number[];
  yOf: (l: number) => number;
}) {
  const grup = new Map<number, number[]>();
  row.forEach((n, i) => {
    if (n.grupBalok < 0) return;
    const g = grup.get(n.grupBalok) ?? [];
    g.push(i);
    grup.set(n.grupBalok, g);
  });

  return (
    <>
      {[...grup.values()].map((anggota, gi) => {
        const naik =
          anggota.filter((i) => arahTangkaiNaik(row[i])).length * 2 >= anggota.length;
        const ys = anggota.map((i) => yOf(row[i].langkah));
        const yBalok = naik
          ? Math.min(...ys) - TANGKAI
          : Math.max(...ys) + TANGKAI;
        const x1 = x[anggota[0]] + (naik ? 6.4 : -6.4);
        const x2 = x[anggota[anggota.length - 1]] + (naik ? 6.4 : -6.4);
        const ganda = anggota.some((i) => row[i].nilai === "seperenambelas");
        return (
          <g key={gi}>
            {anggota.map((i) => (
              <line
                key={i}
                x1={x[i] + (naik ? 6.4 : -6.4)}
                y1={yOf(row[i].langkah)}
                x2={x[i] + (naik ? 6.4 : -6.4)}
                y2={yBalok}
                stroke="var(--foreground)"
                strokeWidth={1.6}
              />
            ))}
            <line x1={x1} y1={yBalok} x2={x2} y2={yBalok} stroke="var(--foreground)" strokeWidth={4} />
            {ganda && (
              <line
                x1={x1}
                y1={yBalok + (naik ? 6 : -6)}
                x2={x2}
                y2={yBalok + (naik ? 6 : -6)}
                stroke="var(--foreground)"
                strokeWidth={4}
              />
            )}
          </g>
        );
      })}
    </>
  );
}

function Istirahat({
  n,
  x,
  yTengah,
  warna,
}: {
  n: NotTata;
  x: number;
  yTengah: number;
  warna: string;
}) {
  if (n.nilai === "penuh" || n.nilai === "setengah") {
    // Tanda istirahat penuh menggantung di bawah garis keempat; yang setengah
    // duduk di atas garis tengah. Bedanya cuma itu, dan itu memang aturannya.
    const gantung = n.nilai === "penuh";
    return (
      <rect
        x={x - 7}
        y={gantung ? yTengah - SP : yTengah - 4}
        width={14}
        height={4}
        fill={warna}
      />
    );
  }
  if (n.nilai === "seperempat") {
    return (
      <path
        d={`M ${x - 3} ${yTengah - 13} L ${x + 4} ${yTengah - 5} L ${x - 3} ${yTengah + 2} L ${x + 4} ${yTengah + 10} C ${x - 2} ${yTengah + 6}, ${x - 5} ${yTengah + 11}, ${x + 1} ${yTengah + 15}`}
        stroke={warna}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
    );
  }
  return (
    <g stroke={warna} strokeWidth={1.8} fill={warna} strokeLinecap="round">
      <line x1={x + 4} y1={yTengah - 9} x2={x - 2} y2={yTengah + 9} />
      <circle cx={x - 1} cy={yTengah - 7} r={2.4} stroke="none" />
      {n.nilai === "seperenambelas" && (
        <circle cx={x + 1} cy={yTengah - 1} r={2.4} stroke="none" />
      )}
    </g>
  );
}

// Dipakai halaman yang mau menulis nada dasarnya di dekat partitur.
export { namaTanda };
