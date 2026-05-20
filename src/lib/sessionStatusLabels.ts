import type { SessionStatus } from "./types";

/** Recruiter-facing session status (never raw checkpoint_* strings). */
export function sessionStatusLabel(status: SessionStatus | string | undefined): string {
  switch (status) {
    case "queued":
      return "Waiting to start";
    case "processing":
      return "Reading your documents";
    case "checkpoint_1_pending":
      return "Waiting for your role selection";
    case "checkpoint_2_pending":
      return "Matching to the role";
    case "checkpoint_3_pending":
      return "Final review in progress";
    case "completed":
      return "Ready";
    case "failed":
      return "Stopped";
    default:
      return "In progress";
  }
}

/** Short label for the live progress strip while the pipeline runs. */
export function livePipelineStageLabel(status: SessionStatus | undefined): string {
  switch (status) {
    case "queued":
      return "Getting started";
    case "processing":
      return "Reading your CV and terms of reference";
    case "checkpoint_1_pending":
      return "Confirm which role applies";
    case "checkpoint_2_pending":
      return "Aligning your experience with the role";
    case "checkpoint_3_pending":
      return "Final quality check";
    case "completed":
      return "Complete";
    case "failed":
      return "Stopped";
    default:
      return "Working on your CV";
  }
}

/** Manifest `checkpoint_pending` step name → readable hint (no checkpoint jargon). */
export function checkpointPendingLabel(checkpoint: string | null | undefined): string | null {
  if (!checkpoint) return null;
  const c = checkpoint.toLowerCase();
  if (c.includes("checkpoint_1") || c === "1") {
    return "Select your role above to continue";
  }
  if (c.includes("checkpoint_2") || c === "2") {
    return "Finishing role alignment — this runs automatically";
  }
  if (c.includes("checkpoint_3") || c === "3") {
    return "Running the final review — almost there";
  }
  return "Working on the next step";
}

/** Hint when a pipeline row is blocked waiting on the user. */
export function pipelineBlockedHint(sessionStatus?: SessionStatus): string {
  if (sessionStatus === "checkpoint_1_pending") {
    return "Select your role above to continue";
  }
  return "Complete the step above to continue";
}
