import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { forwardRef, useEffect, useRef, useState } from "react";

import type { ManifestResponse, SessionStatus } from "../../lib/types";
import {
  currentUserStageIndex,
  deriveUserPipelineStages,
  userStageRowMode,
  type UserPipelineStageView,
} from "./pipelineSteps";

const EASE = [0.22, 1, 0.36, 1] as const;
const LAYOUT_SPRING = { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.85 };
const CELEBRATE_MS = 1100;

type RowMode = "active" | "celebrate" | "collapsed" | "blocked";

function FlowDot({ mode }: { mode: RowMode }) {
  const reduce = useReducedMotion();

  if (mode === "celebrate" || mode === "collapsed") {
    return (
      <motion.span
        layout
        className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent-soft)] ring-1 ring-[var(--chat-accent)]/40"
        initial={reduce ? false : { scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
      >
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-[var(--chat-accent)]" aria-hidden>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 10.5 8.5 14 15 7"
          />
        </svg>
      </motion.span>
    );
  }

  if (mode === "blocked") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-400/35 text-[11px] font-bold text-amber-200">
        !
      </span>
    );
  }

  return (
    <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
      {!reduce && (
        <span
          className="session-pulse-ring absolute inset-0 rounded-full bg-[var(--session-glow-accent)] blur-md"
          aria-hidden
        />
      )}
      <span className="relative flex h-6 w-6 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-bg)]">
        <span className="h-2.5 w-2.5 rounded-full border-2 border-[var(--chat-text)] border-t-transparent motion-reduce:animate-none animate-spin" />
      </span>
    </span>
  );
}

const PipelineFlowStep = forwardRef<
  HTMLLIElement,
  { stage: UserPipelineStageView; mode: RowMode; index: number }
>(function PipelineFlowStep({ stage, mode, index }, ref) {
  const reduce = useReducedMotion();
  const { label, activePhrase } = stage;
  const expanded = mode === "active" || mode === "celebrate" || mode === "blocked";

  return (
    <motion.li
      ref={ref}
      layout="position"
      initial={reduce ? false : { opacity: 0, y: 14, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.5, ease: EASE, delay: reduce ? 0 : Math.min(index * 0.04, 0.2) }}
      className="relative flex gap-3"
    >
      <motion.div layout className="flex w-6 shrink-0 justify-center pt-1">
        <FlowDot mode={mode} />
      </motion.div>

      <motion.div
        layout
        transition={LAYOUT_SPRING}
        className={clsx(
          "min-w-0 flex-1 overflow-hidden rounded-2xl",
          mode === "active" && "pipeline-step-row--active",
          mode === "celebrate" && "pipeline-step-row--celebrate",
          mode === "collapsed" && "pipeline-step-row--done",
          mode === "blocked" && "pipeline-step-row--blocked",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {expanded ? (
            <motion.div
              key="expanded"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.28 }}
              className="relative px-4 py-4 sm:px-5 sm:py-[1.125rem]"
            >
              {!reduce && mode === "active" && (
                <div className="pipeline-step-shimmer pointer-events-none absolute inset-0 opacity-50" aria-hidden />
              )}
              <p className="session-card-eyebrow relative">
                {mode === "celebrate" ? "Complete" : mode === "blocked" ? "Needs you" : "In progress"}
              </p>
              <h3 className="session-card-title relative mt-1 text-[0.9375rem] sm:text-base">
                {label}
              </h3>
              <motion.p
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.35, ease: EASE }}
                className="relative mt-2 text-sm leading-relaxed text-[var(--chat-muted,#b4b4b4)]"
              >
                {mode === "celebrate"
                  ? "Stage finished — moving on"
                  : mode === "blocked"
                  ? "Resolve the checkpoint above to continue"
                  : activePhrase}
              </motion.p>
              {mode === "active" && !reduce && (
                <motion.div
                  className="relative mt-4 h-0.5 overflow-hidden rounded-full bg-[var(--chat-surface-hover,#262626)]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <motion.div
                    className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-[var(--chat-text,#ececec)] to-transparent"
                    animate={{ x: ["-100%", "320%"] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  />
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              layout
              initial={reduce ? false : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="flex items-center px-3 py-2.5 sm:px-4"
            >
              <span className="text-sm text-[var(--chat-muted,#b4b4b4)]">{label}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.li>
  );
});

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
  const [celebrating, setCelebrating] = useState<string | null>(null);
  const seenCompletedRef = useRef<Set<string>>(new Set());
  const prevVisualRef = useRef<Map<string, string>>(new Map());
  const celebrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const backendSteps = manifest?.steps ?? [];
  const userStages = deriveUserPipelineStages(backendSteps, sessionStatus);
  const cur = userStages.length ? currentUserStageIndex(userStages) : 0;
  const allDone = sessionStatus === "completed" || userStages.every((s) => s.visual === "completed");

  useEffect(() => {
    if (reduce || !userStages.length) return;

    for (const stage of userStages) {
      const prev = prevVisualRef.current.get(stage.id);
      prevVisualRef.current.set(stage.id, stage.visual);

      const justCompleted =
        stage.visual === "completed" && prev !== undefined && prev !== "completed";
      if (!justCompleted || seenCompletedRef.current.has(stage.id)) continue;

      seenCompletedRef.current.add(stage.id);
      setCelebrating(stage.id);
      if (celebrateTimerRef.current) clearTimeout(celebrateTimerRef.current);
      celebrateTimerRef.current = setTimeout(() => {
        setCelebrating(null);
        celebrateTimerRef.current = null;
      }, CELEBRATE_MS);
      break;
    }
  }, [userStages, reduce]);

  useEffect(() => {
    return () => {
      if (celebrateTimerRef.current) clearTimeout(celebrateTimerRef.current);
    };
  }, []);

  if (manifestLoading && !manifest && sessionStatus && sessionStatus !== "queued") {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="session-panel px-6 py-8"
      >
        <motion.div className="flex items-center gap-3 text-sm text-[var(--chat-muted,#b4b4b4)]">
          <span className="inline-flex h-4 w-4 shrink-0 rounded-full border-2 border-[var(--chat-text)] border-t-transparent motion-reduce:animate-none animate-spin" />
          Warming up stages…
        </motion.div>
      </motion.div>
    );
  }

  if (manifestError && sessionStatus && sessionStatus !== "queued") {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="session-panel px-6 py-8"
      >
        <p className="text-sm text-[var(--chat-muted,#b4b4b4)]">
          Stages will stream here as soon as the run starts.
        </p>
      </motion.div>
    );
  }

  if (!userStages.length) return null;

  const visible = userStages
    .map((stage, i) => {
      const mode = userStageRowMode(stage, i, cur, celebrating, allDone);
      return mode ? { stage, mode, i } : null;
    })
    .filter(Boolean) as { stage: UserPipelineStageView; mode: RowMode; i: number }[];

  const doneCount = userStages.filter((s) => s.visual === "completed").length;
  const totalCount = userStages.length;

  return (
    <motion.section
      layout
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="session-panel session-card px-6 py-7 sm:px-8 sm:py-8"
    >
      <motion.div layout className="session-card-header flex items-end justify-between gap-4">
        <motion.div layout>
          <span className="session-card-eyebrow">Pipeline</span>
          <h2 className="session-card-title mt-1">
            {allDone ? "All stages complete" : "Your CV journey"}
          </h2>
        </motion.div>
        <motion.span
          layout
          key={doneCount}
          initial={reduce ? false : { opacity: 0.6, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="session-meta-pill tabular-nums"
        >
          {doneCount}
          <span className="opacity-50"> / </span>
          {totalCount}
        </motion.span>
      </motion.div>

      {manifest?.checkpoint_pending && !allDone && (
        <motion.p
          layout
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 text-sm text-[var(--chat-accent)]"
        >
          Waiting on{" "}
          <span className="font-semibold">{manifest.checkpoint_pending.replace(/_/g, " ")}</span>
        </motion.p>
      )}

      {manifest?.reviewer_blocked && (
        <motion.p
          layout
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 text-sm leading-relaxed text-amber-200/80"
        >
          Review flagged an item — check the deliverable section when ready.
        </motion.p>
      )}

      <LayoutGroup>
        <ul className="relative mt-7 space-y-2">
          <span
            className="pipeline-flow-rail pointer-events-none absolute bottom-3 left-[0.6875rem] top-3 w-px"
            aria-hidden
          />
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map(({ stage, mode, i }) => (
              <PipelineFlowStep key={stage.id} stage={stage} mode={mode} index={i} />
            ))}
          </AnimatePresence>
        </ul>
      </LayoutGroup>
    </motion.section>
  );
}
