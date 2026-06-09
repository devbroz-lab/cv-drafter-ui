import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { useEffect, useId, useState } from "react";

import { checkpointPendingLabel } from "../../lib/sessionStatusLabels";
import type { ManifestResponse, SessionStatus, WarningEntry } from "../../lib/types";
import { backendStepLabel, reviewFindingsSummary } from "../../lib/utils/pipelineManifest";
import {
  activePhraseForCurrentStep,
  deriveUserPipelineStages,
  type UserPipelineStageView,
} from "./pipelineSteps";
import type { StepVisualState } from "./stepVisual";

const EASE = [0.22, 1, 0.36, 1] as const;

type TrackStatus = "done" | "running" | "pending";

function toTrackStatus(visual: StepVisualState): TrackStatus {
  if (visual === "completed" || visual === "approved") return "done";
  if (visual === "running" || visual === "blocked" || visual === "failed") return "running";
  return "pending";
}

function pipelineCardTitle(
  allDone: boolean,
  sessionStatus: SessionStatus | undefined,
  currentStep: string | null | undefined,
): string {
  if (allDone) return "All stages complete";
  if (sessionStatus === "failed") return "Processing stopped";
  const phrase = activePhraseForCurrentStep(currentStep);
  if (phrase) return phrase;
  if (
    sessionStatus === "processing" ||
    sessionStatus === "checkpoint_1_pending" ||
    sessionStatus === "checkpoint_2_pending" ||
    sessionStatus === "checkpoint_3_pending"
  ) {
    return "Processing your CV…";
  }
  return "Your CV journey";
}

function PipelineProgressTrack({ statuses }: { statuses: TrackStatus[] }) {
  return (
    <div className="pipeline-status-track" aria-hidden>
      {statuses.map((status, i) => (
        <span key={i} className="contents">
          <span
            className={clsx(
              "pipeline-status-track__dot",
              status === "done" && "pipeline-status-track__dot--done",
              status === "running" && "pipeline-status-track__dot--running",
              status === "pending" && "pipeline-status-track__dot--pending",
            )}
          />
          {i < statuses.length - 1 && (
            <span
              className={clsx(
                "pipeline-status-track__line",
                statuses[i] === "done" && statuses[i + 1] === "done" && "pipeline-status-track__line--done",
                statuses[i] === "done" &&
                  statuses[i + 1] === "running" &&
                  "pipeline-status-track__line--half",
                !(statuses[i] === "done" && (statuses[i + 1] === "done" || statuses[i + 1] === "running")) &&
                  "pipeline-status-track__line--pending",
              )}
            />
          )}
        </span>
      ))}
    </div>
  );
}

function StepStatusTag({ visual }: { visual: StepVisualState }) {
  if (visual === "completed" || visual === "approved") {
    return <span className="pipeline-status-step__tag pipeline-status-step__tag--done">Done</span>;
  }
  if (visual === "running") {
    return <span className="pipeline-status-step__tag pipeline-status-step__tag--running">Running</span>;
  }
  if (visual === "blocked") {
    return <span className="pipeline-status-step__tag pipeline-status-step__tag--blocked">Needs you</span>;
  }
  if (visual === "failed") {
    return <span className="pipeline-status-step__tag pipeline-status-step__tag--failed">Stopped</span>;
  }
  return null;
}

function StageWarnings({ warnings }: { warnings: WarningEntry[] }) {
  const [open, setOpen] = useState(false);
  if (!warnings.length) return null;

  return (
    <div className="pipeline-status-step__warnings">
      <button
        type="button"
        className="pipeline-status-step__warnings-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="pipeline-status-step__warnings-badge">{warnings.length}</span>
        <span>{warnings.length === 1 ? "notice" : "notices"}</span>
        <span className={clsx("pipeline-status-card__chevron", open && "pipeline-status-card__chevron--open")}>
          ⌄
        </span>
      </button>
      {open && (
        <ul className="pipeline-status-step__warnings-list list-none p-0 m-0">
          {warnings.map((w, i) => (
            <li key={`${w.kind}-${i}`} className="pipeline-status-step__warnings-item">
              <span className="pipeline-status-step__warnings-dot" aria-hidden />
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PipelineStepRow({ stage }: { stage: UserPipelineStageView }) {
  const { label, visual, elapsedLabel, warnings } = stage;

  return (
    <li className="pipeline-status-step">
      <span
        className={clsx(
          "pipeline-status-step__icon",
          (visual === "completed" || visual === "approved") && "pipeline-status-step__icon--done",
          visual === "running" && "pipeline-status-step__icon--running",
          visual === "pending" && "pipeline-status-step__icon--pending",
          visual === "blocked" && "pipeline-status-step__icon--blocked",
          visual === "failed" && "pipeline-status-step__icon--failed",
        )}
      >
        {(visual === "completed" || visual === "approved") && (
          <svg className="pipeline-status-step__check" viewBox="0 0 12 12" aria-hidden>
            <polyline points="2,6 5,9 10,3" />
          </svg>
        )}
        {visual === "running" && (
          <svg className="pipeline-status-step__spinner" viewBox="0 0 12 12" aria-hidden>
            <path d="M6 1.5 A4.5 4.5 0 0 1 10.5 6" strokeDasharray="7 14" />
          </svg>
        )}
        {visual === "pending" && <span className="pipeline-status-step__pending-dot" />}
        {visual === "blocked" && (
          <span className="text-[10px] font-bold leading-none text-amber-400">!</span>
        )}
        {visual === "failed" && (
          <span className="text-[10px] font-bold leading-none text-red-400">×</span>
        )}
      </span>
      <div className="pipeline-status-step__body min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "pipeline-status-step__name",
              (visual === "completed" || visual === "approved") && "pipeline-status-step__name--done",
              visual === "running" && "pipeline-status-step__name--running",
              visual === "pending" && "pipeline-status-step__name--pending",
              visual === "blocked" && "pipeline-status-step__name--blocked",
              visual === "failed" && "pipeline-status-step__name--failed",
            )}
          >
            {label}
          </span>
          {warnings.length > 0 && !elapsedLabel && (
            <span className="pipeline-status-step__warnings-badge pipeline-status-step__warnings-badge--inline">
              {warnings.length}
            </span>
          )}
        </div>
        {elapsedLabel ? <p className="pipeline-status-step__elapsed">{elapsedLabel}</p> : null}
        <StageWarnings warnings={warnings} />
      </div>
      <StepStatusTag visual={visual} />
    </li>
  );
}

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
  const stepsListId = useId();
  const backendSteps = manifest?.steps ?? [];
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!manifest?.current_step) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [manifest?.current_step]);

  const userStages = deriveUserPipelineStages(backendSteps, sessionStatus, {
    currentStep: manifest?.current_step,
    warnings: manifest?.warnings ?? [],
    nowMs,
  });
  const allDone = sessionStatus === "completed" || userStages.every((s) => s.visual === "completed");
  const doneCount = userStages.filter(
    (s) => s.visual === "completed" || s.visual === "approved",
  ).length;
  const totalCount = userStages.length;

  const [stepsOpen, setStepsOpen] = useState(() => !allDone);

  useEffect(() => {
    if (allDone) setStepsOpen(false);
    else if (doneCount > 0) setStepsOpen(true);
  }, [allDone, doneCount]);

  if (manifestLoading && !manifest && sessionStatus && sessionStatus !== "queued") {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="session-panel pipeline-status-card px-6 py-8"
      >
        <div className="flex items-center gap-3 text-sm text-[var(--chat-muted,#b4b4b4)]">
          <span className="inline-flex h-4 w-4 shrink-0 rounded-full border-2 border-[var(--chat-text)] border-t-transparent motion-reduce:animate-none animate-spin" />
          Warming up stages…
        </div>
      </motion.div>
    );
  }

  if (manifestError && sessionStatus && sessionStatus !== "queued") {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="session-panel pipeline-status-card px-6 py-8"
      >
        <p className="text-sm text-[var(--chat-muted,#b4b4b4)]">
          Stages will stream here as soon as the run starts.
        </p>
      </motion.div>
    );
  }

  if (!userStages.length) return null;

  const trackStatuses = userStages.map((s) => toTrackStatus(s.visual));
  const pendingHint = !allDone ? checkpointPendingLabel(manifest?.checkpoint_pending) : null;
  const reviewSummary = reviewFindingsSummary(manifest?.warnings);
  const reviewerWarning = manifest?.reviewer_blocked
    ? reviewSummary
      ? `Review flagged ${reviewSummary.high} item${reviewSummary.high !== 1 ? "s" : ""} for your attention${
          reviewSummary.low > 0 ? ` (${reviewSummary.low} auto-polished)` : ""
        } — check the deliverable when ready.`
      : "Review flagged an item — check the deliverable section when ready."
    : null;
  const warningMessage = reviewerWarning ?? pendingHint;
  const totalWarnings = manifest?.warnings?.length ?? 0;

  const summaryText =
    doneCount === totalCount
      ? "All stages completed successfully"
      : `${doneCount} of ${totalCount} stages done`;

  const title = pipelineCardTitle(allDone, sessionStatus, manifest?.current_step);
  const currentStepHint = manifest?.current_step
    ? backendStepLabel(manifest.current_step)
    : null;

  return (
    <motion.section
      layout
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="session-panel session-card pipeline-status-card"
      aria-labelledby={`${stepsListId}-title`}
    >
      <div className="pipeline-status-card__top">
        <span className="pipeline-status-card__label">Pipeline</span>
        <span className="pipeline-status-card__count">
          {doneCount} / {totalCount}
        </span>
      </div>

      <h2 className="pipeline-status-card__title" id={`${stepsListId}-title`}>
        {title}
      </h2>

      {currentStepHint && !allDone && (
        <p className="pipeline-status-card__hint">
          Current step: <span className="text-[var(--chat-text)]">{currentStepHint}</span>
        </p>
      )}

      {warningMessage && (
        <div className="pipeline-status-card__warning" role="status">
          <span className="pipeline-status-card__warning-dot" aria-hidden />
          <p className="pipeline-status-card__warning-text">{warningMessage}</p>
        </div>
      )}

      {totalWarnings > 0 && !allDone && (
        <p className="pipeline-status-card__notices-summary">
          {totalWarnings} agent notice{totalWarnings !== 1 ? "s" : ""} so far — expand steps below for detail.
        </p>
      )}

      <PipelineProgressTrack statuses={trackStatuses} />

      <div
        className="pipeline-status-card__toggle"
        role="button"
        tabIndex={0}
        aria-expanded={stepsOpen}
        aria-controls={stepsListId}
        onClick={() => setStepsOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setStepsOpen((o) => !o);
          }
        }}
      >
        <span className="pipeline-status-card__summary">{summaryText}</span>
        <span className="pipeline-status-card__toggle-btn" aria-hidden>
          {stepsOpen ? "Hide" : "Show"} steps
          <span
            className={clsx(
              "pipeline-status-card__chevron",
              stepsOpen && "pipeline-status-card__chevron--open",
            )}
          >
            ⌄
          </span>
        </span>
      </div>

      <ul
        id={stepsListId}
        className={clsx(
          "pipeline-status-card__steps list-none p-0 m-0",
          stepsOpen && "pipeline-status-card__steps--open",
        )}
      >
        {userStages.map((stage) => (
          <PipelineStepRow key={stage.id} stage={stage} />
        ))}
      </ul>
    </motion.section>
  );
}
