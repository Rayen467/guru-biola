"use client";

// Kartu evaluasi yang muncul begitu mic distop.

import type { SessionReport } from "@/lib/sessionEval";

export default function SessionEval({
  report,
  onClose,
}: {
  report: SessionReport | null;
  onClose?: () => void;
}) {
  if (!report) return null;

  const grade =
    report.score >= 85
      ? { label: "Mantap", color: "text-good", ring: "stroke-[var(--good)]" }
      : report.score >= 65
        ? { label: "Lumayan", color: "text-accent-strong", ring: "stroke-[var(--accent)]" }
        : { label: "Masih kasar", color: "text-bad", ring: "stroke-[var(--bad)]" };

  const circumference = 2 * Math.PI * 42;

  return (
    <div className="animate-fade-up rounded-2xl border border-accent/40 bg-surface p-5">
      <div className="flex flex-wrap items-center gap-4">
        {/* Cincin skor */}
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="var(--surface-2)"
              strokeWidth="8"
            />
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
                  "--ring-target": `${circumference * (1 - report.score / 100)}`,
                } as React.CSSProperties
              }
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold ${grade.color}`}>
              {report.score}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted">
              skor sesi
            </span>
          </div>
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-bold">
            Evaluasi sesi — <span className={grade.color}>{grade.label}</span>
          </h3>
          <p className="text-xs text-muted">
            {Math.round(report.seconds)} detik · nada kebaca{" "}
            {report.detectedPct}% · volume rata-rata {report.avgDb} dB
            {report.avgCents !== null && ` · meleset ${report.avgCents} cent`}
          </p>
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
        {report.verdicts.map((v, i) => (
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
