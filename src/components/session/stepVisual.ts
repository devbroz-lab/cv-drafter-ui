import type { ManifestStep } from "../../lib/types";

export type StepVisualState =
  | "completed"
  | "running"
  | "failed"
  | "blocked"
  | "pending"
  | "approved";

export function inferStepVisualState(step: ManifestStep): StepVisualState {
  const raw = (step.status ?? "").toLowerCase().trim();

  if (raw.includes("fail") || raw.includes("error")) return "failed";
  if (step.completed_at) {
    if (raw.includes("approve")) return "approved";
    return "completed";
  }
  if (raw.includes("block") || raw.includes("reviewer") || raw.includes("manual")) return "blocked";
  if (raw.includes("approve")) return "approved";
  if (
    raw.includes("run") ||
    raw.includes("progress") ||
    raw === "processing" ||
    raw === "pending" ||
    raw === "in_progress" ||
    raw === "started" ||
    raw === "queued"
  ) {
    return "running";
  }
  if (raw.includes("skip") || raw === "done" || raw === "success") return "completed";
  return "pending";
}

/** Index of the step that should read as “current” in the timeline (for emphasis / connector). */
export function currentStepIndex(steps: ManifestStep[]): number {
  let idx = 0;
  for (let i = 0; i < steps.length; i++) {
    const v = inferStepVisualState(steps[i]);
    if (v === "running" || v === "blocked" || v === "failed") return i;
    if (v === "pending") return i;
    idx = i;
  }
  return idx;
}
