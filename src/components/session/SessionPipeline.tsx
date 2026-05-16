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
    <div className={clsx("relative", embedded ? "" : "session-panel session-card p-6 sm:p-7")}>
      {embedded && (
        <span className="session-card-eyebrow session-card-eyebrow--accent mb-4 block">Live</span>
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
            <span className="session-card-eyebrow session-card-eyebrow--accent mb-2 block">Live</span>
          )}
          <p className="text-sm text-[var(--chat-muted,#b4b4b4)]">
            Working on <span className="font-medium text-[var(--chat-text,#ececec)]">“{shortLabel}”</span>
          </p>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--chat-muted,#b4b4b4)]/90">
            Stage: <span className="capitalize text-[var(--chat-text,#ececec)]">{stage}</span>
          </p>
        </motion.div>
        <motion.div className="flex shrink-0 items-baseline gap-1 tabular-nums">
          <span className="text-3xl font-medium text-[var(--chat-text,#ececec)]">{progressPct}</span>
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
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: reduce ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </motion.div>
    </div>
  );
}
