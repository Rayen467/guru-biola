"use client";

// Pemilih cara nulis nada. Ditaruh di halaman yang menampilkan not, dan
// setelannya berlaku di semua halaman sekaligus — kalau tiap halaman punya
// setelan sendiri, yang belum hafal nama nada bakal ketemu tulisan berbeda
// tiap pindah menu.

import { LABEL_MODES, setLabelMode, useLabelMode } from "@/lib/noteLabel";

export default function LabelSwitch({ compact = false }: { compact?: boolean }) {
  const mode = useLabelMode();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!compact && (
        <span className="text-[11px] text-muted">Tulis nada sebagai:</span>
      )}
      {LABEL_MODES.map((m) => (
        <button
          key={m.v}
          onClick={() => setLabelMode(m.v)}
          title={
            m.v === "huruf"
              ? "Huruf nadanya doang — sama persis kayak stiker di fingerboard."
              : m.v === "senarJari"
              ? "A2 = senar A, jari 2. Paling gampang buat yang belum hafal nama nada."
              : m.v === "senarNada"
                ? "A–C♯ = senar A, nadanya C♯."
                : "Nama nada resmi seperti di partitur."
          }
          className={`press rounded-full px-2.5 py-1 text-[11px] ${
            mode === m.v
              ? "bg-accent font-semibold text-background"
              : "bg-surface-2 text-muted hover:text-foreground"
          }`}
        >
          {m.contoh}
        </button>
      ))}
    </div>
  );
}
