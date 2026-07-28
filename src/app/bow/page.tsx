"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BOW_STYLES,
  HOLD_STEPS,
  MISTAKES,
  STROKES,
  type BowStyle,
} from "@/lib/bow";

// Halaman pegangan bow: anatomi, cara bentuk pegangan langkah demi langkah,
// tiga mazhab pegangan, kesalahan umum, dan teknik gesekan.
//
// Gambarnya digambar manual pakai SVG — bukan foto — supaya jelas mana yang
// ditunjuk, bisa disorot per jari, dan ikut tema gelap app ini.

export default function BowPage() {
  const [styleId, setStyleId] = useState(BOW_STYLES[0].id);
  const [activeFinger, setActiveFinger] = useState<string | null>(null);
  const [openStep, setOpenStep] = useState<number>(1);
  const style = BOW_STYLES.find((s) => s.id === styleId)!;

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header>
        <h1 className="text-2xl font-bold">🏹 Pegangan Bow & Teknik Gesekan</h1>
        <p className="mt-1 text-sm text-muted">
          Tangan kanan yang nentuin BUNYI. Jari kiri cuma milih nada — kualitas
          suaranya, keras-pelannya, karakternya, semua dari tangan bow. Salah
          pegang bow itu batu sandungan paling lama buat pemula.
        </p>
      </header>

      {/* 1. Anatomi */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Kenali dulu bagiannya</h2>
        <div className="rounded-2xl border border-border-soft bg-surface p-4">
          <BowAnatomy />
        </div>
        <p className="text-xs text-muted">
          Istilah yang bakal sering muncul: <b>frog</b> (pangkal, tempat tangan
          megang), <b>tip</b> (ujung), <b>stick</b> (batang), <b>hair</b> (bulu
          kuda), <b>screw</b> (sekrup pengencang), <b>grip/lapping</b>{" "}
          (lilitan tempat jempol nempel).
        </p>
      </section>

      {/* 2. Langkah bentuk pegangan */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. Bentuk pegangannya — 6 langkah</h2>
        <p className="text-sm text-muted">
          Urutannya penting: jempol dulu, kelingking terakhir. Kalau dibalik,
          jempol lu bakal ngunci buat nahan berat bow, dan itu susah dihilangin
          nanti.
        </p>
        <ol className="space-y-2">
          {HOLD_STEPS.map((s) => {
            const open = openStep === s.n;
            return (
              <li
                key={s.n}
                className={`overflow-hidden rounded-xl border transition-colors ${
                  open ? "border-accent/50 bg-surface" : "border-border-soft bg-surface"
                }`}
              >
                <button
                  onClick={() => setOpenStep(open ? 0 : s.n)}
                  className="flex w-full items-center gap-3 p-3 text-left"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      open
                        ? "bg-accent text-background"
                        : "bg-surface-2 text-accent-strong"
                    }`}
                  >
                    {s.n}
                  </span>
                  <span className="flex-1 text-sm font-semibold">{s.title}</span>
                  <span className="text-muted">{open ? "▲" : "▼"}</span>
                </button>
                {open && (
                  <div className="animate-fade-up space-y-2 border-t border-border-soft p-3">
                    <p className="text-sm">{s.detail}</p>
                    <p className="rounded-lg bg-surface-2 p-2 text-xs text-muted">
                      ✅ <b className="text-foreground">Cara ngecek:</b> {s.check}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* 3. Mazhab pegangan */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">3. Tiga mazhab pegangan</h2>
        <p className="text-sm text-muted">
          Bedanya cuma satu hal utama: <b>seberapa dalam stick masuk ke
          telunjuk</b>. Kelihatan sepele, tapi itu yang nentuin dari mana
          tekanan datang — dan itu kedengeran.
        </p>

        <div className="flex flex-wrap gap-2">
          {BOW_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setStyleId(s.id);
                setActiveFinger(null);
              }}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${
                s.id === styleId
                  ? "bg-accent font-semibold text-background"
                  : "bg-surface-2 text-muted hover:text-foreground"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-border-soft bg-surface p-4">
          <div className="text-sm font-semibold text-accent-strong">
            {style.name}
          </div>
          <div className="text-xs text-muted">{style.alias}</div>

          <HandOnFrog
            style={style}
            active={activeFinger}
            onPick={(id) => setActiveFinger(id === activeFinger ? null : id)}
          />

          <p className="mt-2 text-center text-xs text-muted">
            Klik titik jarinya buat lihat penjelasannya
          </p>

          <div className="mt-3 space-y-2">
            {style.fingers.map((f) => (
              <button
                key={f.id}
                onClick={() =>
                  setActiveFinger(f.id === activeFinger ? null : f.id)
                }
                className={`block w-full rounded-lg p-2.5 text-left text-xs transition-colors ${
                  activeFinger === f.id
                    ? "bg-accent/15 text-foreground"
                    : "bg-surface-2 text-muted hover:text-foreground"
                }`}
              >
                <b className="text-accent-strong">{f.label}:</b> {f.note}
              </button>
            ))}
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Dipakai siapa" value={style.who} />
            <Info label="Karakter bunyi" value={style.sound} />
            <Info label="Kelebihan" value={style.pros.join(" · ")} />
            <Info label="Kekurangan" value={style.cons.join(" · ")} />
          </dl>

          <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
            👉 <b className="text-accent-strong">Cocok buat:</b> {style.bestFor}
          </p>
        </div>
      </section>

      {/* 4. Kesalahan umum */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">4. Lima kesalahan paling sering</h2>
        <ul className="space-y-2">
          {MISTAKES.map((m) => (
            <li
              key={m.title}
              className="rounded-xl border border-border-soft bg-surface p-4"
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="text-lg">{m.icon}</span>
                {m.title}
              </div>
              <p className="mt-1 text-xs text-muted">
                <b className="text-foreground">Kenapa masalah:</b> {m.why}
              </p>
              <p className="mt-1 text-xs text-accent-strong">
                <b>Latihannya:</b> {m.fix}
              </p>
            </li>
          ))}
        </ul>
        <p className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-xs">
          🎥 Mau dicek langsung? Buka{" "}
          <Link href="/postur" className="text-accent-strong underline">
            pelatih postur
          </Link>{" "}
          — kamera bakal ngukur sudut siku tangan bow dan kelurusan jalur
          bow-nya.
        </p>
      </section>

      {/* 5. Teknik gesekan */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">5. Teknik gesekan (bow stroke)</h2>
        <p className="text-sm text-muted">
          Urut dari yang dipelajari duluan. Jangan loncat — spiccato yang
          dipaksa sebelum détaché rata cuma bakal jadi kebiasaan mantul yang
          gak terkontrol.
        </p>
        <div className="space-y-2">
          {STROKES.map((s) => (
            <details
              key={s.id}
              className="group rounded-xl border border-border-soft bg-surface p-3"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3">
                <span className="flex-1 text-sm font-semibold">{s.name}</span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                  {s.level}
                </span>
                <span className="text-muted transition-transform group-open:rotate-180">
                  ▼
                </span>
              </summary>
              <div className="animate-fade-up mt-3 space-y-2 border-t border-border-soft pt-3">
                <p className="text-sm">{s.what}</p>
                <p className="text-xs text-muted">
                  <b className="text-foreground">Caranya:</b> {s.how}
                </p>
                <p className="text-xs text-muted">
                  <b className="text-foreground">Latihannya:</b> {s.practice}
                </p>
                {s.tool && (
                  <Link
                    href={s.tool}
                    className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold text-background hover:bg-accent-strong"
                  >
                    buka alatnya →
                  </Link>
                )}
              </div>
            </details>
          ))}
        </div>
      </section>

      <div className="space-y-2 rounded-xl border border-border-soft bg-surface p-4 text-xs text-muted">
        <p>
          🕐 <b className="text-foreground">Realistisnya:</b> pegangan bow yang
          bener butuh 2-4 minggu latihan 5 menit/hari sampai kerasa normal.
          Awalnya PASTI kerasa aneh dan gampang lepas — itu tandanya lu lagi
          berhenti ngandelin jepitan.
        </p>
        <p>
          🪶 <b className="text-foreground">Tes rileks:</b> pas main, coba
          angkat kelingking sebentar. Kalau bow langsung oleng parah, berarti
          selama ini lu megang terlalu kenceng.
        </p>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-xs">{value}</dd>
    </div>
  );
}

// Bow utuh dari samping, dengan label bagian-bagiannya.
function BowAnatomy() {
  return (
    <svg viewBox="0 0 700 180" className="w-full">
      {/* stick */}
      <path
        d="M90 96 Q 360 78 640 70"
        stroke="var(--accent-strong)"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      {/* hair */}
      <line
        x1="96"
        y1="108"
        x2="638"
        y2="80"
        stroke="var(--foreground)"
        strokeWidth="4"
        opacity="0.75"
      />
      {/* frog */}
      <rect x="70" y="92" width="46" height="26" rx="5" fill="var(--muted)" />
      <circle cx="82" cy="105" r="4" fill="var(--surface)" />
      {/* grip / lapping */}
      <rect x="118" y="90" width="26" height="15" rx="4" fill="var(--border)" />
      {/* screw */}
      <rect x="52" y="99" width="20" height="9" rx="4" fill="var(--accent)" />
      {/* tip */}
      <path d="M636 62 l16 6 -4 20 -14 -6 z" fill="var(--muted)" />

      {[
        { x: 62, y: 140, label: "screw", tx: 62, ty: 128, lx: 62, ly: 112 },
        { x: 93, y: 62, label: "frog", tx: 93, ty: 56, lx: 93, ly: 88 },
        { x: 131, y: 140, label: "grip", tx: 131, ty: 130, lx: 131, ly: 108 },
        { x: 360, y: 140, label: "hair", tx: 360, ty: 130, lx: 360, ly: 96 },
        { x: 430, y: 46, label: "stick", tx: 430, ty: 42, lx: 430, ly: 74 },
        { x: 645, y: 130, label: "tip", tx: 645, ty: 120, lx: 645, ly: 90 },
      ].map((m) => (
        <g key={m.label}>
          <line
            x1={m.lx}
            y1={m.ly}
            x2={m.tx}
            y2={m.ty}
            stroke="var(--border)"
            strokeWidth="1.5"
          />
          <text
            x={m.x}
            y={m.y}
            fontSize="13"
            fill="var(--muted)"
            textAnchor="middle"
          >
            {m.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// Frog dilihat dari sisi pemain, dengan titik jari sesuai mazhab yang dipilih.
function HandOnFrog({
  style,
  active,
  onPick,
}: {
  style: BowStyle;
  active: string | null;
  onPick: (id: string) => void;
}) {
  const W = 520;
  const H = 300;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full">
      {/* stick + frog dari samping */}
      <path
        d="M40 168 Q 260 156 500 148"
        stroke="var(--accent-strong)"
        strokeWidth="9"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="150" y="164" width="120" height="52" rx="10" fill="var(--muted)" />
      <rect x="270" y="160" width="60" height="26" rx="7" fill="var(--border)" />
      <line
        x1="45"
        y1="188"
        x2="500"
        y2="164"
        stroke="var(--foreground)"
        strokeWidth="4"
        opacity="0.6"
      />
      <text x="210" y="240" fontSize="12" fill="var(--muted)" textAnchor="middle">
        frog
      </text>
      <text x="300" y="205" fontSize="12" fill="var(--muted)" textAnchor="middle">
        grip
      </text>

      {/* garis bantu telapak tangan */}
      <path
        d="M120 120 Q 250 84 400 112"
        stroke="var(--border)"
        strokeWidth="2"
        strokeDasharray="6 6"
        fill="none"
      />
      <text x="255" y="74" fontSize="11" fill="var(--muted)" textAnchor="middle">
        arah jari-jari
      </text>

      {style.fingers.map((f) => {
        const cx = 90 + f.x * 340;
        const cy = 60 + f.y * 190;
        const on = active === f.id;
        return (
          <g
            key={f.id}
            onClick={() => onPick(f.id)}
            className="cursor-pointer"
          >
            <circle
              cx={cx}
              cy={cy}
              r={on ? 22 : 17}
              fill={on ? "var(--accent)" : "var(--surface-2)"}
              stroke={on ? "var(--accent-strong)" : "var(--border)"}
              strokeWidth="2.5"
            />
            <text
              x={cx}
              y={cy + 4}
              fontSize="12"
              fontWeight="bold"
              fill={on ? "var(--background)" : "var(--foreground)"}
              textAnchor="middle"
            >
              {f.label.slice(0, 2)}
            </text>
            {on && (
              <text
                x={cx}
                y={cy - 28}
                fontSize="12"
                fill="var(--accent-strong)"
                textAnchor="middle"
              >
                {f.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
