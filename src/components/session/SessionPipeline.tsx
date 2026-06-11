import { motion, useMotionValueEvent, useReducedMotion, useSpring } from "framer-motion";
import clsx from "clsx";
import { useEffect, useState } from "react";

import { livePipelineStageLabel } from "../../lib/sessionStatusLabels";
import type { ManifestResponse, SessionStatus } from "../../lib/types";
import { backendStepLabel } from "../../lib/utils/pipelineManifest";
import { activePhraseForCurrentStep } from "./pipelineSteps";

const PROGRESS_SPRING = { stiffness: 42, damping: 22, mass: 0.85 };

export function SessionLivePipelineStrip({
  status,
  progressPct,
  fileLabel,
  manifest,
  embedded = false,
}: {
  status: SessionStatus | undefined;
  progressPct: number;
  fileLabel: string;
  manifest?: ManifestResponse;
  embedded?: boolean;
}) {
  const reduce = useReducedMotion();
  const springProgress = useSpring(progressPct, reduce ? { duration: 0 } : PROGRESS_SPRING);
  const [displayPct, setDisplayPct] = useState(progressPct);

  useEffect(() => {
    springProgress.set(progressPct);
  }, [progressPct, springProgress]);

  useMotionValueEvent(springProgress, "change", (value) => {
    setDisplayPct(Math.round(value));
  });

  const activePhrase = activePhraseForCurrentStep(manifest?.current_step);
  const stepHint = manifest?.current_step ? backendStepLabel(manifest.current_step) : null;
  const stage = activePhrase ?? livePipelineStageLabel(status);
  const shortLabel = fileLabel.length > 48 ? `${fileLabel.slice(0, 45)}…` : fileLabel;

  return (
    <div className={clsx("relative", embedded ? "" : "session-panel session-card p-6 sm:p-7")}>
      {embedded && (
        <span className="session-card-eyebrow session-card-eyebrow--live mb-4 block">Live</span>
      )}
      <motion.div
        layout
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"
      >
        <motion.div className="min-w-0 flex-1">
          {!embedded && (
            <span className="session-card-eyebrow session-card-eyebrow--live mb-2 block">Live</span>
          )}
          <p className="text-sm text-[var(--chat-muted,#b4b4b4)]">
            Working on <span className="font-medium text-[var(--chat-text,#ececec)]">“{shortLabel}”</span>
          </p>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--chat-muted,#b4b4b4)]/90">
            <span className="text-[var(--chat-text,#ececec)]">{stage}</span>
            {stepHint && (
              <span className="mt-1 block text-[0.75rem] text-[var(--chat-muted,#b4b4b4)]">
                {stepHint}
              </span>
            )}
          </p>
        </motion.div>
        <motion.div className="flex shrink-0 items-baseline gap-1 tabular-nums">
          <span className="text-3xl font-medium text-[var(--chat-text,#ececec)]">{displayPct}</span>
          <span className="text-lg text-[var(--chat-muted,#b4b4b4)]">%</span>
        </motion.div>
      </motion.div>

      <motion.div
        className="session-progress-track mt-6 h-[3px] w-full overflow-hidden rounded-full"
        initial={false}
      >
        <motion.div
          className="session-progress-fill h-full rounded-full"
          initial={false}
          animate={{ width: `${displayPct}%` }}
          transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </motion.div>
    </div>
  );
}
