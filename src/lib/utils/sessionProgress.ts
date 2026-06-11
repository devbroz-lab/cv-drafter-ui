import type { ManifestStep, ManifestResponse, SessionStatus } from "../types";

/** Mirrors backend STEP_ORDER in pipeline/manifest.py */
const STEP_ORDER = [
  "cv_extractor",
  "tor_summarizer",
  "checkpoint_1",
  "cv_tor_mapper",
  "checkpoint_2",
  "fields_generator",
  "content_reviewer",
  "compressor",
  "checkpoint_3",
  "renderer",
] as const;

/** Coarse DB-status fallback — aligned with manifest weights at each checkpoint. */
export function progressForStatus(status: SessionStatus | undefined): number {
  switch (status) {
    case "queued":
      return 5;
    case "processing":
      return 15;
    case "checkpoint_1_pending":
      return 25;
    case "checkpoint_2_pending":
      return 50;
    case "checkpoint_3_pending":
      return 82;
    case "completed":
      return 100;
    case "failed":
      return 100;
    default:
      return 8;
  }
}

/** Client-side mirror of pipeline.manifest.compute_progress. */
export function computeProgressFromSteps(steps: ManifestStep[]): number {
  if (!steps.length) return 0;
  const total = STEP_ORDER.length;
  let score = 0;
  for (const step of steps) {
    const st = step.status;
    if (st === "done" || st === "approved") score += 1;
    else if (st === "running" || st === "pending" || st === "blocked") score += 0.5;
  }
  return Math.max(0, Math.min(100, Math.round((score / total) * 100)));
}

type ResolveSessionProgressOptions = {
  manifestLoading?: boolean;
  /** Last displayed value — used while status/manifest are briefly unavailable. */
  previous?: number;
};

/**
 * Pick the best available progress target for the live strip.
 * Prefers manifest step weights; falls back to aligned DB status; never returns 0 mid-run.
 */
export function resolveSessionProgress(
  manifest: ManifestResponse | undefined,
  status: SessionStatus | undefined,
  options: ResolveSessionProgressOptions = {},
): number {
  const { manifestLoading, previous = 0 } = options;

  if (status === "completed" || status === "failed") return 100;

  const fromSteps = manifest?.steps?.length
    ? computeProgressFromSteps(manifest.steps)
    : undefined;
  const fromApi = manifest?.progress;

  const manifestProgress =
    fromApi !== undefined && fromApi > 0
      ? fromApi
      : fromSteps !== undefined && fromSteps > 0
        ? fromSteps
        : undefined;

  if (manifestProgress !== undefined) return manifestProgress;
  if (status) return progressForStatus(status);
  if (manifestLoading && previous > 0) return previous;
  return previous > 0 ? previous : progressForStatus(status);
}
