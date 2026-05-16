import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";

import type { SessionStatus } from "../../lib/types";

export function SessionLivePipelineStrip({
  status,
  progressPct,
  fileLabel,
  embedded = false,
}: {
  status: SessionStatus | undefined;
  progressPct: number;
  fileLabel: string;
  embedded?: boolean;
}) {
  const reduce = useReducedMotion();
  const stage = (status ?? "starting").replace(/_/g, " ");
  const shortLabel = fileLabel.length > 48 ? `${fileLabel.slice(0, 45)}…` : fileLabel;

  return (
    <motion.div
      layout
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={clsx(
        "relative overflow-hidden",
        embedded
          ? "session-live-embedded rounded-[1.125rem] border border-white/[0.09] bg-gradient-to-b from-black/50 to-black/[0.22] p-5 sm:p-6"
          : "session-surface-card rounded-3xl p-6 sm:p-8",
      )}
    >
      {!reduce && <motion.div className="session-shimmer pointer-events-none absolute inset-0 opacity-40" aria-hidden />}
      <motion.div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <motion.div className="flex min-w-0 gap-4">
          <motion.div
            className={clsx(
              "relative flex shrink-0 items-center justify-center",
              embedded ? "mt-0.5 h-12 w-12" : "mt-0.5 h-11 w-11",
            )}
          >
            {!reduce && (
              <span
                className="session-pulse-ring absolute inset-0 rounded-2xl bg-[var(--color-accent)]/20 blur-md"
                aria-hidden
              />
            )}
            <span
              className={clsx(
                "relative flex items-center justify-center rounded-xl bg-[var(--color-accent)]/15 ring-1 ring-[var(--color-accent)]/35",
                embedded ? "h-10 w-10" : "h-9 w-9",
              )}
            >
              <span className="relative flex h-3.5 w-3.5">
                {!reduce && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)]/35" />
                )}
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-[var(--color-accent)] border-t-transparent motion-reduce:animate-none animate-spin" />
              </span>
            </span>
          </motion.div>
          <motion.div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
              Live pipeline
            </p>
            <h2
              className={clsx(
                "mt-1.5 font-semibold leading-snug tracking-[-0.02em] text-[var(--color-text)]",
                embedded ? "text-lg sm:text-xl" : "text-[1.0625rem] sm:text-lg",
              )}
            >
              Transforming <span className="text-[var(--color-text)]">“{shortLabel}”</span>
            </h2>
            <p
              className={clsx(
                "mt-3 max-w-md leading-relaxed text-[var(--color-text-muted)]",
                embedded ? "text-[13px] sm:text-sm" : "text-[13px]",
              )}
            >
              Your document is being transformed in the background. This workspace updates automatically as each stage
              completes — no refresh needed.
            </p>
          </motion.div>
        </motion.div>
        <motion.div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <motion.span
            key={progressPct}
            initial={reduce ? false : { opacity: 0.5, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className={clsx(
              "font-semibold tabular-nums tracking-tight text-[var(--color-text)]",
              embedded ? "text-3xl sm:text-[2rem]" : "text-2xl",
            )}
          >
            {progressPct}
            <span className={clsx("font-medium text-[var(--color-text-muted)]", embedded ? "text-xl" : "text-lg")}>
              %
            </span>
          </motion.span>
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-200/90 ring-1 ring-emerald-400/20">
            <span className="relative flex h-2 w-2">
              {!reduce && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/50" />
              )}
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Connected
          </span>
        </motion.div>
      </motion.div>

      <motion.div
        className={clsx(
          "relative w-full overflow-hidden rounded-full bg-white/[0.05]",
          embedded ? "mt-6 h-2" : "mt-6 h-1.5",
        )}
      >
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#c96d4d] via-[var(--color-accent)] to-[#e8a090]"
          initial={false}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: reduce ? 0 : 0.85, ease: [0.22, 1, 0.36, 1] }}
        />
      </motion.div>

      <motion.div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-black/25 px-4 py-3 sm:bg-black/30">
        <p className="text-[12px] text-[var(--color-text-muted)]">
          <span className="text-[var(--color-text-muted)]">Current stage</span>{" "}
          <span className="font-medium capitalize text-[var(--color-text)]">{stage}</span>
        </p>
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-muted)]/80">Live</p>
      </motion.div>
    </motion.div>
  );
}
