import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

import { formatFieldPath } from "../../lib/fieldEditDisplay";
import type { HighSeverityIssue, LowSeverityIssue, OutputResponse } from "../../lib/types";

function SolvabilityChip({ solvability }: { solvability?: string }) {
  if (!solvability) return null;
  if (solvability === "pipeline") {
    return <span className="insight-chip insight-chip--auto">Auto-fixable</span>;
  }
  return <span className="insight-chip insight-chip--human">Human review</span>;
}

function GenerationWarnings({ warnings }: { warnings: string[] }) {
  const reduce = useReducedMotion();
  if (!warnings.length) return null;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="insight-notices"
    >
      <div className="insight-notices__header">
        <p className="insight-notices__title">System notices</p>
        <span className="insight-notices__count">{warnings.length}</span>
      </div>
      <ul className="insight-notices__list">
        <AnimatePresence initial={false}>
          {warnings.map((w, i) => (
            <motion.li
              key={`${i}-${w.slice(0, 24)}`}
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduce ? 0 : i * 0.04 }}
              className="insight-notices__item"
            >
              <span className="insight-notices__dot" aria-hidden />
              <span>{w}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </motion.div>
  );
}

function findingSummary(issueText: string | undefined, maxLen = 110): string {
  const text = (issueText ?? "").trim();
  if (!text) return "Review item";
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 40 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trim()}…`;
}

function HighInsightCard({ issue, index }: { issue: HighSeverityIssue; index: number }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const summary = findingSummary(issue.issue);
  const fieldPath = issue.field ?? issue.path;

  return (
    <motion.article
      layout
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : index * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="insight-card insight-card--attention"
    >
      <button type="button" onClick={() => setOpen((o) => !o)} className="insight-card__toggle">
        <div className="min-w-0 space-y-1.5">
          <p className="insight-card__label">Attention</p>
          <p className="insight-card__summary line-clamp-2">{summary}</p>
          <div className="flex flex-wrap items-center gap-2">
            {fieldPath ? (
              <code className="insight-field-chip" title={fieldPath}>
                {formatFieldPath(fieldPath)}
              </code>
            ) : null}
            <SolvabilityChip solvability={issue.solvability} />
          </div>
        </div>
        <span className="insight-card__chevron" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="insight-card__body"
          >
            <p className="insight-card__section-title">What we found</p>
            <p className="insight-card__finding">{issue.issue ?? "—"}</p>
            {issue.recommendation ? (
              <div className="insight-card__fix">
                <p className="insight-card__section-title">Suggested fix</p>
                <p className="insight-card__finding">{issue.recommendation}</p>
              </div>
            ) : null}
            {issue.solvability === "pipeline" ? (
              <p className="insight-card__hint">
                Use <strong>Refine in document</strong> to apply a structured rewrite for this field.
              </p>
            ) : null}
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
      className="insight-card"
    >
      <button type="button" onClick={() => setOpen((o) => !o)} className="insight-card__toggle">
        <div>
          <p className="insight-card__section-title">Polishing pass</p>
          <p className="insight-card__summary mt-0.5">
            {lows.length} style improvement{lows.length !== 1 ? "s" : ""} applied automatically
          </p>
        </div>
        <span className="insight-card__chevron" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            className="insight-card__body border-t border-[var(--chat-border-subtle)]"
          >
            <ul className="session-scrollbar max-h-[min(420px,55vh)] space-y-3 overflow-y-auto text-sm">
              {lows.map((l, i) => (
                <li key={i} className="session-subcard p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[var(--chat-text)]">{l.issue ?? "—"}</p>
                    <SolvabilityChip solvability={l.solvability} />
                  </div>
                  {(l.fixed ?? l.original) ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-[var(--chat-accent)]">
                        What changed
                      </summary>
                      <div className="mt-2 grid gap-2 text-xs">
                        {l.original !== undefined ? (
                          <div>
                            <span className="insight-card__section-title">Before</span>
                            <p className="insight-card__finding">{String(l.original)}</p>
                          </div>
                        ) : null}
                        {l.fixed !== undefined ? (
                          <div>
                            <span className="insight-card__section-title">After</span>
                            <p className="insight-card__finding">{String(l.fixed)}</p>
                          </div>
                        ) : null}
                      </div>
                    </details>
                  ) : null}
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
        <h3 className="insight-review__heading">AI quality review</h3>
        {review.passed ? (
          <span className="insight-badge insight-badge--cleared">Cleared</span>
        ) : (
          <span className="insight-badge insight-badge--review">
            {highs.length} item{highs.length !== 1 ? "s" : ""} for your review
          </span>
        )}
        {lows.length > 0 ? (
          <span className="insight-badge insight-badge--polish">
            {lows.length} auto polish{lows.length !== 1 ? "es" : ""}
          </span>
        ) : null}
      </div>

      {highs.length > 0 ? (
        <div className="space-y-3">
          {highs.map((h, i) => (
            <HighInsightCard key={i} issue={h} index={i} />
          ))}
        </div>
      ) : null}

      {lows.length > 0 ? <LowSeverityCollapsible lows={lows} /> : null}
    </motion.section>
  );
}

export function SessionOutputInsights({ data }: { data: OutputResponse }) {
  return (
    <div className="mt-8 space-y-6">
      <GenerationWarnings warnings={data.generation_warnings ?? []} />
      <ReviewInsights data={data} />
    </div>
  );
}
