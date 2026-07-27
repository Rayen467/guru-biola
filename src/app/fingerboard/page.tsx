"use client";

import { useState } from "react";
import { midiToFreq, midiToName } from "@/lib/notes";
import { playTone } from "@/lib/tone";

// Posisi 1 (first position): senar kosong + jari 1-4.
// Kolom = senar (G D A E), baris = jari.
const STRINGS = [
  { name: "G", open: 55 },
  { name: "D", open: 62 },
  { name: "A", open: 69 },
  { name: "E", open: 76 },
];

// offset semitone dari senar kosong untuk jari 1-4 (pola mayor standar pemula)
const FINGERS = [
  { finger: 0, offset: 0, label: "0 (kosong)" },
  { finger: 1, offset: 2, label: "jari 1 (telunjuk)" },
  { finger: 2, offset: 4, label: "jari 2 (tengah)" },
  { finger: 3, offset: 5, label: "jari 3 (manis)" },
  { finger: 4, offset: 7, label: "jari 4 (kelingking)" },
];

export default function FingerboardPage() {
  const [selected, setSelected] = useState<{ s: number; f: number } | null>(
    null
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">🖐️ Peta Fingerboard (Posisi 1)</h1>
        <p className="mt-1 text-sm text-muted">
          Biola gak punya fret — ini petanya. Klik titik = dengar nadanya +
          lihat jari mana yang dipakai. Pola dasar jari 2 &quot;nempel&quot; ke
          jari 3? Itu urusan level lanjut — pola di bawah ini pola mayor standar
          pemula.
        </p>
      </header>

      <div className="rounded-2xl border border-border-soft bg-surface p-6">
        {/* header senar */}
        <div className="mb-2 grid grid-cols-[7rem_repeat(4,1fr)] gap-2 text-center">
          <div />
          {STRINGS.map((s) => (
            <div key={s.name} className="font-bold text-accent-strong">
              senar {s.name}
            </div>
          ))}
        </div>

        {FINGERS.map((f, fi) => (
          <div
            key={f.finger}
            className="grid grid-cols-[7rem_repeat(4,1fr)] items-center gap-2 border-t border-border-soft py-2"
          >
            <div className="text-xs text-muted">{f.label}</div>
            {STRINGS.map((s, si) => {
              const midi = s.open + f.offset;
              const isSel = selected?.s === si && selected?.f === fi;
              return (
                <button
                  key={s.name}
                  onClick={() => {
                    setSelected({ s: si, f: fi });
                    playTone(midiToFreq(midi), 1.2);
                  }}
                  className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full border text-sm font-semibold transition-colors ${
                    isSel
                      ? "border-accent bg-accent text-background"
                      : f.finger === 0
                        ? "border-dashed border-muted bg-surface-2 text-muted hover:border-accent hover:text-foreground"
                        : "border-border-soft bg-surface-2 hover:border-accent"
                  }`}
                  title={`${midiToName(midi)} — ${f.label}`}
                >
                  {midiToName(midi)}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border-soft bg-surface p-4 text-sm text-muted">
        💡 Perhatiin: jari 3 di satu senar = senar kosong berikutnya (contoh:
        jari 3 di senar D = A, sama kayak senar A kosong). Itu cara ngecek
        intonasi paling gampang — bunyiin dua-duanya, harus kedengeran sama
        persis.
      </div>
    </div>
  );
}
