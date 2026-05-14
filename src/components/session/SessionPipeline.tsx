import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import type { ManifestResponse, SessionStatus } from "../../lib/types";
import { currentStepIndex, inferStepVisualState, type StepVisualState } from "./stepVisual";

// ---------------------------------------------------------------------------
// Live pipeline strip (global progress + stage)
// ---------------------------------------------------------------------------

export function SessionLivePipelineStrip({
  status,
  progressPct,
  fileLabel,
  embedded = false,
}: {
  status: SessionStatus | undefined;
  progressPct: number;
  fileLabel: string;
  /** When true, nested inside `.session-composer-surface` (no duplicate outer session card). */
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
      {!reduce && <div className="session-shimmer pointer-events-none absolute inset-0 opacity-40" aria-hidden />}
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className={clsx("relative flex shrink-0 items-center justify-center", embedded ? "mt-0.5 h-12 w-12" : "mt-0.5 h-11 w-11")}>
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
          </div>
          <div className="min-w-0">
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
              Your document is being transformed in the background. This workspace updates automatically as each
              stage completes — no refresh needed.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
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
        </div>
      </div>

      <div
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
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-black/25 px-4 py-3 sm:bg-black/30">
        <p className="text-[12px] text-[var(--color-text-muted)]">
          <span className="text-[var(--color-text-muted)]">Current stage</span>{" "}
          <span className="font-medium capitalize text-[var(--color-text)]">{stage}</span>
        </p>
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-muted)]/80">
          Polling
        </p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Step row visuals
// ---------------------------------------------------------------------------

function stateLabel(v: StepVisualState): string {
  switch (v) {
    case "completed":
      return "Done";
    case "approved":
      return "Approved";
    case "running":
      return "Running";
    case "blocked":
      return "Needs input";
    case "failed":
      return "Failed";
    default:
      return "Queued";
  }
}

function StepOrb({ visual, active }: { visual: StepVisualState; active: boolean }) {
  const reduce = useReducedMotion();
  const pulse = active && visual === "running" && !reduce;

  return (
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
      {pulse && (
        <span
          className="session-pulse-ring absolute inset-0 rounded-2xl bg-[var(--session-glow-accent)] blur-md"
          aria-hidden
        />
      )}
      <span
        className={[
          "relative flex h-8 w-8 items-center justify-center rounded-xl border transition-colors duration-300",
          visual === "completed" || visual === "approved"
            ? "border-emerald-400/20 bg-emerald-500/12"
            : visual === "running"
            ? "border-[var(--color-accent)]/25 bg-[var(--color-accent)]/12"
            : visual === "blocked"
            ? "border-amber-400/18 bg-amber-500/10"
            : visual === "failed"
            ? "border-red-400/22 bg-red-500/12"
            : "border-white/[0.06] bg-white/[0.03]",
        ].join(" ")}
      >
        {visual === "completed" || visual === "approved" ? (
          <motion.svg
            viewBox="0 0 20 20"
            className="h-4 w-4 text-emerald-300"
            initial={reduce ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            aria-hidden
          >
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 10.5 8.5 14 15 7"
            />
          </motion.svg>
        ) : visual === "running" ? (
          <span className="block h-3.5 w-3.5 rounded-full border-2 border-[var(--color-accent)] border-t-transparent motion-reduce:animate-none animate-spin" />
        ) : visual === "blocked" ? (
          <span className="text-xs font-bold text-amber-200">!</span>
        ) : visual === "failed" ? (
          <span className="text-xs font-bold text-red-200">×</span>
        ) : (
          <span className="h-2 w-2 rounded-full bg-white/25" />
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export function SessionPipelineTimeline({
  manifest,
  sessionStatus,
  manifestLoading,
  manifestError,
}: {
  manifest: ManifestResponse | undefined;
  sessionStatus: SessionStatus | undefined;
  manifestLoading: boolean;
  manifestError: boolean;
}) {
  const reduce = useReducedMotion();

  if (manifestLoading && !manifest && sessionStatus && sessionStatus !== "queued") {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="session-surface-card rounded-3xl p-6 sm:p-8"
      >
        <div className="flex items-center gap-3 text-sm text-[var(--color-text-muted)]">
          <span className="inline-flex h-4 w-4 shrink-0 rounded-full border-2 border-[var(--color-accent)] border-t-transparent motion-reduce:animate-none animate-spin" />
          Syncing pipeline stages…
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
          {!reduce && <div className="session-shimmer h-full rounded-full opacity-50" />}
        </div>
      </motion.div>
    );
  }

  if (manifestError && sessionStatus && sessionStatus !== "queued") {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-white/[0.05] bg-white/[0.025] p-7 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.45)]"
      >
        <p className="text-sm text-[var(--color-text-muted)]">
          Detailed stages will appear here as soon as the run initializes.
        </p>
      </motion.div>
    );
  }

  if (!manifest?.steps?.length) return null;

  const steps = manifest.steps;
  const cur = currentStepIndex(steps);

  return (
    <motion.section
      layout
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="session-surface-card rounded-3xl p-6 sm:p-8"
    >
      <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
            Execution graph
          </p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-[var(--color-text)] sm:text-[1.35rem]">
            Pipeline stages
          </h2>
        </div>
        {manifest.checkpoint_pending && (
          <motion.p
            initial={reduce ? false : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-sm text-[11px] leading-snug text-[var(--color-accent)] sm:max-w-xs sm:text-right"
          >
            Awaiting{" "}
            <span className="font-semibold">{manifest.checkpoint_pending.replace(/_/g, " ")}</span>
          </motion.p>
        )}
      </div>

      {manifest.reviewer_blocked && (
        <p className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-500/[0.07] px-4 py-3 text-center text-xs text-amber-100/90 sm:text-left">
          Reviewer flagged a block — resolve the checkpoint above to continue.
        </p>
      )}

      <ul className="relative mt-8 space-y-0 pl-1 sm:pl-2">
        <span
          className="session-timeline-spine pointer-events-none absolute left-[1.125rem] top-5 bottom-8 w-px sm:left-[1.25rem]"
          aria-hidden
        />
        <AnimatePresence initial={false}>
          {steps.map((step, i) => {
            const visual = inferStepVisualState(step);
            const active = i === cur;
            const done = visual === "completed" || visual === "approved";

            return (
              <motion.li
                key={step.name}
                layout="position"
                initial={reduce ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: reduce ? 0 : i * 0.035, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className={[
                  "relative flex gap-4 pb-8 pl-9 last:pb-0 sm:pl-10",
                  active ? "z-[1]" : "",
                ].join(" ")}
              >
                <div className="absolute left-0 top-0">
                  <StepOrb visual={visual} active={active} />
                </div>
                <motion.div
                  layout
                  className={[
                    "min-w-0 flex-1 rounded-2xl border px-4 py-3.5 transition-[box-shadow,background-color,border-color] duration-300",
                    active && visual === "running"
                      ? "border-[var(--color-accent)]/22 bg-[var(--color-accent)]/[0.07] shadow-[0_0_0_1px_rgba(217,119,87,0.06),0_18px_44px_-18px_rgba(217,119,87,0.2)]"
                      : active && visual === "blocked"
                      ? "border-amber-400/18 bg-amber-500/[0.05] shadow-[0_14px_36px_-20px_rgba(251,191,36,0.12)]"
                      : done
                      ? "border-emerald-400/12 bg-emerald-500/[0.04] shadow-[0_12px_32px_-22px_rgba(0,0,0,0.35)]"
                      : "border-white/[0.04] bg-white/[0.02] shadow-[0_12px_36px_-24px_rgba(0,0,0,0.4)]",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--color-text)]">{step.name}</p>
                    <span
                      className={[
                        "rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]",
                        visual === "completed" || visual === "approved"
                          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200/95"
                          : visual === "running"
                          ? "border-[var(--color-accent)]/22 bg-[var(--color-accent)]/12 text-[#f2d4c9]"
                          : visual === "blocked"
                          ? "border-amber-400/20 bg-amber-500/10 text-amber-100/95"
                          : visual === "failed"
                          ? "border-red-400/22 bg-red-500/10 text-red-100/95"
                          : "border-white/[0.08] bg-white/[0.03] text-[var(--color-text-muted)]",
                      ].join(" ")}
                    >
                      {stateLabel(visual)}
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono text-[10px] text-[var(--color-text-muted)]/90">{step.status}</p>
                  {step.completed_at && (
                    <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                      Finished{" "}
                      <time dateTime={step.completed_at}>{new Date(step.completed_at).toLocaleString()}</time>
                    </p>
                  )}
                </motion.div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </motion.section>
  );
}
