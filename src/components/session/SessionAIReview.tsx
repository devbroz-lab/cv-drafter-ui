import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import type { HighSeverityIssue, LowSeverityIssue, OutputResponse } from "../../lib/types";

function SolvabilityChip({ solvability }: { solvability?: string }) {
  if (!solvability) return null;
  if (solvability === "pipeline")
    return (
      <span className="rounded-full bg-teal-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-200/95 ring-1 ring-teal-400/25">
        Auto-fixable
      </span>
    );
  return (
    <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100/95 ring-1 ring-amber-400/25">
      Human review
    </span>
  );
}

function GenerationWarnings({ warnings }: { warnings: string[] }) {
  const reduce = useReducedMotion();
  if (!warnings.length) return null;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl bg-amber-500/[0.06] ring-1 ring-amber-400/20"
    >
      <div className="flex items-center justify-between gap-2 border-b border-amber-400/15 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100/90">System notices</p>
        <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-medium tabular-nums text-amber-100/80">
          {warnings.length}
        </span>
      </div>
      <ul className="divide-y divide-amber-400/10">
        <AnimatePresence initial={false}>
          {warnings.map((w, i) => (
            <motion.li
              key={`${i}-${w.slice(0, 24)}`}
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduce ? 0 : i * 0.04 }}
              className="flex gap-3 px-4 py-3 text-sm leading-relaxed text-[var(--color-text)]/95"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300/80" aria-hidden />
              <span>{w}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </motion.div>
  );
}

function HighInsightCard({ issue, index }: { issue: HighSeverityIssue; index: number }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(true);

  return (
    <motion.article
      layout
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : index * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl bg-gradient-to-b from-red-500/[0.07] to-white/[0.02] ring-1 ring-red-400/20"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-red-200/85">Attention</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[var(--color-text)]">Finding {index + 1}</span>
            {(issue.field ?? issue.path) && (
              <code className="rounded-md bg-black/30 px-2 py-0.5 font-mono text-[10px] text-[var(--color-accent)]">
                {issue.field ?? issue.path}
              </code>
            )}
            <SolvabilityChip solvability={issue.solvability} />
          </div>
        </div>
        <span className="shrink-0 text-[var(--color-text-muted)]">{open ? "−" : "+"}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-red-400/15 px-4 pb-4 pt-2"
          >
            <p className="text-sm leading-relaxed text-[var(--color-text)]">{issue.issue ?? "—"}</p>
            {issue.recommendation && (
              <div className="mt-3 rounded-xl bg-black/25 px-3 py-2.5 ring-1 ring-white/[0.05]">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Suggested fix
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-muted)]">{issue.recommendation}</p>
              </div>
            )}
            {issue.solvability === "pipeline" && (
              <p className="mt-3 text-xs text-teal-200/75">Use Edit Document to apply a structured rewrite for this path.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function LowSeverityCollapsible({ lows }: { lows: LowSeverityIssue[] }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  return (
    <motion.div
      layout
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06]"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            Polishing pass
          </p>
          <p className="mt-0.5 text-sm font-medium text-[var(--color-text)]">
            {lows.length} style improvement{lows.length !== 1 ? "s" : ""} applied automatically
          </p>
        </div>
        <span className="text-[var(--color-text-muted)]">{open ? "−" : "+"}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            className="border-t border-white/[0.06]"
          >
            <ul className="max-h-[min(420px,55vh)] space-y-3 overflow-y-auto px-4 py-4 text-sm text-[var(--color-text-muted)] editor-scrollbar">
              {lows.map((l, i) => (
                <li key={i} className="rounded-xl bg-black/20 p-3 ring-1 ring-white/[0.04]">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[var(--color-text)]">{l.issue ?? "—"}</p>
                    <SolvabilityChip solvability={l.solvability} />
                  </div>
                  {(l.fixed ?? l.original) && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-[var(--color-accent)]">
                        Before / after
                      </summary>
                      <div className="mt-2 grid gap-2 text-xs">
                        {l.original !== undefined && (
                          <div>
                            <span className="text-[var(--color-text-muted)]">Original</span>
                            <p className="mt-0.5 whitespace-pre-wrap text-[var(--color-text)]">{String(l.original)}</p>
                          </div>
                        )}
                        {l.fixed !== undefined && (
                          <div>
                            <span className="text-[var(--color-text-muted)]">Adjusted</span>
                            <p className="mt-0.5 whitespace-pre-wrap text-[var(--color-text)]">{String(l.fixed)}</p>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ReviewInsights({ data }: { data: OutputResponse }) {
  const review = data.review;
  if (!review) return null;

  const highs: HighSeverityIssue[] = review.high_severity ?? [];
  const lows: LowSeverityIssue[] = review.low_severity ?? [];
  if (highs.length === 0 && lows.length === 0) return null;

  const reduce = useReducedMotion();

  return (
    <motion.section
      layout
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold tracking-tight text-[var(--color-text)]">AI quality review</h3>
        {review.passed ? (
          <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-100/95 ring-1 ring-emerald-400/25">
            Cleared
          </span>
        ) : (
          <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-[11px] font-semibold text-amber-100/95 ring-1 ring-amber-400/25">
            {highs.length} item{highs.length !== 1 ? "s" : ""} for your review
          </span>
        )}
        {lows.length > 0 && (
          <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] text-[var(--color-text-muted)] ring-1 ring-white/[0.08]">
            {lows.length} auto polish{lows.length !== 1 ? "es" : ""}
          </span>
        )}
      </div>

      {highs.length > 0 && (
        <div className="space-y-3">
          {highs.map((h, i) => (
            <HighInsightCard key={i} issue={h} index={i} />
          ))}
        </div>
      )}

      {lows.length > 0 && <LowSeverityCollapsible lows={lows} />}
    </motion.section>
  );
}

export function SessionOutputInsights({ data }: { data: OutputResponse }) {
  return (
    <div className="mt-8 space-y-6">
      <GenerationWarnings warnings={data.generation_warnings ?? []} />
      <ReviewInsights data={data} />

      {data.compression && (
        <details className="group overflow-hidden rounded-2xl bg-white/[0.02] ring-1 ring-white/[0.06]">
          <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
            <span className="inline-flex w-full items-center justify-between gap-2">
              Compression trace
              <span className="text-[var(--color-text-muted)] group-open:rotate-0">▾</span>
            </span>
          </summary>
          <pre className="max-h-[260px] overflow-auto border-t border-white/[0.06] px-4 py-3 text-xs leading-relaxed text-[var(--color-text-muted)] editor-scrollbar">
            {JSON.stringify(data.compression, null, 2)}
          </pre>
        </details>
      )}

      <details className="group overflow-hidden rounded-2xl bg-white/[0.02] ring-1 ring-white/[0.06]">
        <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
          <span className="inline-flex w-full items-center justify-between gap-2">
            Structured CV data (JSON)
            <span className="text-[var(--color-text-muted)]">▾</span>
          </span>
        </summary>
        <pre className="max-h-[min(480px,50vh)] overflow-auto border-t border-white/[0.06] px-4 py-3 text-xs leading-relaxed text-[var(--color-text-muted)] editor-scrollbar">
          {JSON.stringify(data.cv_data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
