"use client";

// Penggambar paranada (kunci G) untuk deretan not.
//
// Digambar manual pakai SVG, bukan font musik: glyph musik sering tidak ada di
// Windows dan berubah jadi kotak. Posisi not dihitung dalam LANGKAH DIATONIS,
// jadi C♯ dan C duduk di garis yang sama dan cuma beda tanda kres — persis
// seperti notasi sungguhan.

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function staffStep(midi: number): { step: number; sharp: boolean } {
  const name = NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { step: LETTERS.indexOf(name[0]) + 7 * octave, sharp: name.length > 1 };
}

const BOTTOM_LINE = staffStep(64).step; // E4, garis paling bawah
const TOP_LINE = staffStep(77).step; // F5, garis paling atas

export interface StaffNote {
  midi: number;
  beats?: number;
}

export default function Staff({
  notes,
  current = -1,
  done = -1,
  perRow = 8,
  labels,
  bowMarks,
  dyns,
}: {
  notes: StaffNote[];
  current?: number; // indeks not yang sedang dimainkan
  done?: number; // indeks terakhir yang sudah benar
  perRow?: number;
  // Tulisan kecil di bawah tiap not (mis. "A2" = senar A jari 2). Buat yang
  // belum hafal nama nada, ini yang bikin partitur bisa langsung dimainkan.
  labels?: string[];
  // Tanda arah bow di ATAS not: ⊓ turun, V naik. Posisinya di atas memang
  // aturan notasi sungguhan, bukan pilihan gaya.
  bowMarks?: string[];
  // Dinamika (p, mf, f) — ditulis sekali saat berubah, bukan di tiap not,
  // persis seperti di partitur cetak.
  dyns?: (string | null)[];
}) {
  const rows: StaffNote[][] = [];
  for (let i = 0; i < notes.length; i += perRow) {
    rows.push(notes.slice(i, i + perRow));
  }

  return (
    <div className="space-y-2">
      {rows.map((row, r) => (
        <StaffRow
          key={r}
          notes={row}
          offset={r * perRow}
          current={current}
          done={done}
          perRow={perRow}
          labels={labels}
          bowMarks={bowMarks}
          dyns={dyns}
        />
      ))}
    </div>
  );
}

function StaffRow({
  notes,
  offset,
  current,
  done,
  perRow,
  labels,
  bowMarks,
  dyns,
}: {
  notes: StaffNote[];
  offset: number;
  current: number;
  done: number;
  perRow: number;
  labels?: string[];
  bowMarks?: string[];
  dyns?: (string | null)[];
}) {
  // Tinggi dan posisi dihitung sebagai PITA yang tidak boleh saling masuk:
  //   atas   : tanda arah bow
  //   tengah : paranada + garis bantu + tangkai not
  //   bawah  : dinamika, lalu label nada
  // Sebelumnya semuanya dijejalkan ke 150px, jadi not rendah dan tangkainya
  // menabrak tulisan di bawah — persis yang kelihatan berantakan di layar.
  const gap = 14;
  const half = gap / 2;
  const TOP_BAND = 30; // ruang buat tanda bow
  const STAFF_H = gap * 4;
  const bottomY = TOP_BAND + STAFF_H;
  const BELOW = 52; // ruang buat garis bantu + tangkai ke bawah
  const DYN_Y = bottomY + BELOW + 14;
  const LABEL_Y = DYN_Y + 20;
  const H = LABEL_Y + 8;
  const left = 46;
  const step = 74;
  const W = left + perRow * step + 20;

  const yOf = (s: number) => bottomY - (s - BOTTOM_LINE) * half;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1={20}
          y1={bottomY - i * gap}
          x2={W - 10}
          y2={bottomY - i * gap}
          stroke="var(--border)"
          strokeWidth="1.4"
        />
      ))}
      {/* penanda kunci G: lingkaran di garis nada G4 */}
      <circle
        cx={32}
        cy={yOf(staffStep(67).step)}
        r={9}
        fill="none"
        stroke="var(--muted)"
        strokeWidth="1.2"
      />
      <text
        x={32}
        y={yOf(staffStep(67).step) + 4}
        fontSize={11}
        fill="var(--muted)"
        textAnchor="middle"
      >
        G
      </text>

      {notes.map((n, i) => {
        const idx = offset + i;
        const x = left + i * step + step / 2;
        const { step: s, sharp } = staffStep(n.midi);
        const y = yOf(s);
        const aktif = idx === current;
        const sudah = idx <= done;
        const warna = aktif
          ? "var(--accent-strong)"
          : sudah
            ? "var(--good)"
            : "var(--foreground)";

        // Garis bantu buat not di luar paranada.
        const ledgers: number[] = [];
        for (let k = BOTTOM_LINE - 2; k >= s; k -= 2) ledgers.push(k);
        for (let k = TOP_LINE + 2; k <= s; k += 2) ledgers.push(k);
        const stemUp = s < BOTTOM_LINE + 4;
        // Not yang panjangnya >= 2 ketuk digambar berongga (not setengah).
        const hollow = (n.beats ?? 1) >= 2;

        return (
          <g key={idx} className={aktif ? "animate-pop" : undefined}>
            {ledgers.map((k) => (
              <line
                key={k}
                x1={x - 13}
                y1={yOf(k)}
                x2={x + 13}
                y2={yOf(k)}
                stroke="var(--foreground)"
                strokeWidth="1.3"
              />
            ))}
            {/* Tanda kres digeser cukup dekat: kalau terlalu jauh ke kiri, dia
                masuk ke wilayah not sebelumnya. */}
            {sharp && (
              <text x={x - 16} y={y + 4} fontSize={15} fill={warna} textAnchor="middle">
                ♯
              </text>
            )}
            <ellipse
              cx={x}
              cy={y}
              rx={7.5}
              ry={5.5}
              fill={hollow ? "none" : warna}
              stroke={warna}
              strokeWidth={hollow ? 2 : 0}
              transform={`rotate(-20 ${x} ${y})`}
            />
            {/* Tangkai dipotong supaya tidak pernah masuk ke pita tulisan di
                bawah maupun ke tanda bow di atas. */}
            <line
              x1={stemUp ? x + 7 : x - 7}
              y1={y}
              x2={stemUp ? x + 7 : x - 7}
              y2={
                stemUp
                  ? Math.max(TOP_BAND - 4, y - 38)
                  : Math.min(bottomY + BELOW - 6, y + 38)
              }
              stroke={warna}
              strokeWidth={1.8}
            />
            {aktif && (
              <circle
                cx={x}
                cy={y}
                r={16}
                fill="none"
                stroke="var(--accent-strong)"
                strokeWidth="1.5"
                className="ping-once"
              />
            )}
            {labels?.[idx] && (
              <text
                x={x}
                y={LABEL_Y}
                fontSize={13}
                fontWeight={aktif ? 700 : 500}
                fill={aktif ? "var(--accent-strong)" : "var(--muted)"}
                textAnchor="middle"
              >
                {labels[idx]}
              </text>
            )}
            {bowMarks?.[idx] && (
              <text
                x={x}
                y={TOP_BAND - 12}
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
                x={x}
                y={DYN_Y}
                fontSize={14}
                fontStyle="italic"
                fontWeight={700}
                fill="var(--accent)"
                textAnchor="middle"
              >
                {dyns[idx]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
