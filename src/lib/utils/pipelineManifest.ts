import type { ManifestStep, WarningEntry } from "../types";

/** Format a duration in ms for step elapsed labels. */
export function formatElapsedMs(ms: number): string {
  if (ms < 1000) return "<1s";
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

function isRunningStatus(status: string): boolean {
  const raw = status.toLowerCase();
  return raw === "running" || raw.includes("progress") || raw === "in_progress";
}

/** Elapsed label for a single backend step. */
export function stepElapsedLabel(step: ManifestStep, nowMs: number): string | null {
  if (!step.started_at) return null;
  const start = new Date(step.started_at).getTime();
  if (Number.isNaN(start)) return null;

  if (step.completed_at) {
    const end = new Date(step.completed_at).getTime();
    if (!Number.isNaN(end)) return `Took ${formatElapsedMs(end - start)}`;
  }

  if (isRunningStatus(step.status)) {
    return `Running ${formatElapsedMs(Math.max(0, nowMs - start))}`;
  }

  return null;
}

/** Elapsed label for a recruiter-facing stage (group of backend steps). */
export function stageElapsedLabel(
  backendStepNames: readonly string[],
  byName: Map<string, ManifestStep>,
  currentStep: string | null,
  nowMs: number,
): string | null {
  for (const name of backendStepNames) {
    const step = byName.get(name);
    if (step && isRunningStatus(step.status)) {
      const label = stepElapsedLabel(step, nowMs);
      if (label) return label;
    }
  }

  if (currentStep && backendStepNames.includes(currentStep)) {
    const step = byName.get(currentStep);
    if (step) {
      const label = stepElapsedLabel(step, nowMs);
      if (label) return label;
    }
  }

  let latest: { label: string; end: number } | null = null;
  for (const name of backendStepNames) {
    const step = byName.get(name);
    if (!step?.started_at || !step.completed_at) continue;
    const end = new Date(step.completed_at).getTime();
    if (Number.isNaN(end)) continue;
    const label = stepElapsedLabel(step, nowMs);
    if (label?.startsWith("Took ") && (!latest || end > latest.end)) {
      latest = { label, end };
    }
  }
  return latest?.label ?? null;
}

/** Warnings whose `stage` belongs to one visual pipeline stage. */
export function warningsForBackendSteps(
  backendStepNames: readonly string[],
  warnings: WarningEntry[],
): WarningEntry[] {
  const names = new Set(backendStepNames);
  return warnings.filter((w) => names.has(w.stage));
}

/** Compact review summary from manifest `review_findings` warning. */
export function reviewFindingsSummary(
  warnings: WarningEntry[] | undefined,
): { high: number; low: number; passed: boolean } | null {
  const entry = warnings?.find((w) => w.kind === "review_findings");
  if (!entry?.details) return null;
  const d = entry.details;
  return {
    high: Number(d.high ?? 0),
    low: Number(d.low ?? 0),
    passed: Boolean(d.passed),
  };
}

/** Human label for a backend step id (for live strip sub-label). */
export function backendStepLabel(stepName: string): string {
  const labels: Record<string, string> = {
    cv_extractor: "Reading CV",
    tor_summarizer: "Summarising ToR",
    checkpoint_1: "Role selection",
    cv_tor_mapper: "Mapping experience",
    checkpoint_2: "Alignment check",
    fields_generator: "Writing fields",
    content_reviewer: "Quality review",
    compressor: "Page limit fit",
    checkpoint_3: "Final approval",
    renderer: "Generating document",
  };
  return labels[stepName] ?? stepName.replace(/_/g, " ");
}
