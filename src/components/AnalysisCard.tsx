"use client";

// Kartu analisis untuk fitur NON-mic (postur, pegangan bow, latih kuping,
// metronom). Halaman mic pakai SessionEval yang punya ukurannya sendiri;
// yang ini bentuknya sama biar kebiasaan bacanya seragam.

export interface Verdict {
  icon: string;
  title: string;
  detail: string;
  tone: "good" | "warn" | "bad";
}

export interface Analysis {
  score: number; // 0..100
  headline: string;
  subline: string;
  verdicts: Verdict[];
}

export default function AnalysisCard({
  analysis,
  onClose,
}: {
  analysis: Analysis | null;
  onClose?: () => void;
}) {
  if (!analysis) return null;
  const { score } = analysis;
  const grade =
    score >= 85
      ? { label: "Mantap", color: "text-good", ring: "stroke-[var(--good)]" }
      : score >= 60
        ? { label: "Lumayan", color: "text-accent-strong", ring: "stroke-[var(--accent)]" }
        : { label: "Masih kasar", color: "text-bad", ring: "stroke-[var(--bad)]" };

  const circumference = 2 * Math.PI * 42;

  return (
    <div className="animate-fade-up sweep relative overflow-hidden rounded-2xl border border-accent/40 bg-surface p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--surface-2)" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              className={`${grade.ring} animate-ring`}
              style={
                {
                  strokeDasharray: circumference,
                  "--ring-target": `${circumference * (1 - score / 100)}`,
                } as React.CSSProperties
              }
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold ${grade.color}`}>{score}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted">skor</span>
          </div>
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-bold">
            {analysis.headline} — <span className={grade.color}>{grade.label}</span>
          </h3>
          <p className="text-xs text-muted">{analysis.subline}</p>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted transition-colors hover:text-foreground"
          >
            tutup
          </button>
        )}
      </div>

      <ul className="mt-4 space-y-2">
        {analysis.verdicts.map((v, i) => (
          <li
            key={v.title}
            className="animate-fade-up flex items-start gap-3 rounded-lg bg-surface-2 p-3"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className="text-lg">{v.icon}</span>
            <div className="flex-1">
              <div
                className={`text-sm font-semibold ${
                  v.tone === "good"
                    ? "text-good"
                    : v.tone === "bad"
                      ? "text-bad"
                      : "text-accent-strong"
                }`}
              >
                {v.title}
              </div>
              <div className="text-xs text-muted">{v.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
