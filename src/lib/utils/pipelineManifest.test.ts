import { describe, expect, it } from "vitest";

import type { ManifestStep } from "../types";

import {
  formatElapsedMs,
  reviewFindingsSummary,
  stageElapsedLabel,
  warningsForBackendSteps,
} from "./pipelineManifest";

describe("formatElapsedMs", () => {
  it("formats seconds and minutes", () => {
    expect(formatElapsedMs(500)).toBe("<1s");
    expect(formatElapsedMs(12_000)).toBe("12s");
    expect(formatElapsedMs(125_000)).toBe("2m 5s");
  });
});

describe("warningsForBackendSteps", () => {
  it("filters by backend step id", () => {
    const warnings = [
      { stage: "cv_extractor", kind: "extraction_warning", message: "A" },
      { stage: "fields_generator", kind: "generation_warning", message: "B" },
    ];
    const result = warningsForBackendSteps(["cv_extractor", "tor_summarizer"], warnings);
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("A");
  });
});

describe("stageElapsedLabel", () => {
  const matchRoleSteps = ["checkpoint_1", "cv_tor_mapper", "checkpoint_2"] as const;
  const nowMs = new Date("2026-05-19T12:00:30Z").getTime();

  it("shows Running while a sub-step is in flight", () => {
    const byName = new Map<string, ManifestStep>([
      [
        "checkpoint_1",
        {
          name: "checkpoint_1",
          status: "approved",
          started_at: "2026-05-19T12:00:00Z",
          completed_at: "2026-05-19T12:00:15Z",
        },
      ],
      [
        "cv_tor_mapper",
        {
          name: "cv_tor_mapper",
          status: "running",
          started_at: "2026-05-19T12:00:15Z",
          completed_at: null,
        },
      ],
      ["checkpoint_2", { name: "checkpoint_2", status: "waiting", started_at: null, completed_at: null }],
    ]);

    expect(stageElapsedLabel(matchRoleSteps, byName, "cv_tor_mapper", nowMs)).toBe("Running 15s");
  });

  it("does not show Took from a finished sub-step while the stage is still active", () => {
    const byName = new Map<string, ManifestStep>([
      [
        "checkpoint_1",
        {
          name: "checkpoint_1",
          status: "approved",
          started_at: "2026-05-19T12:00:00Z",
          completed_at: "2026-05-19T12:00:15Z",
        },
      ],
      ["cv_tor_mapper", { name: "cv_tor_mapper", status: "waiting", started_at: null, completed_at: null }],
      ["checkpoint_2", { name: "checkpoint_2", status: "waiting", started_at: null, completed_at: null }],
    ]);

    expect(stageElapsedLabel(matchRoleSteps, byName, null, nowMs)).toBeNull();
  });

  it("shows Took only after every sub-step in the stage is finished", () => {
    const byName = new Map<string, ManifestStep>([
      [
        "checkpoint_1",
        {
          name: "checkpoint_1",
          status: "approved",
          started_at: "2026-05-19T12:00:00Z",
          completed_at: "2026-05-19T12:00:15Z",
        },
      ],
      [
        "cv_tor_mapper",
        {
          name: "cv_tor_mapper",
          status: "done",
          started_at: "2026-05-19T12:00:15Z",
          completed_at: "2026-05-19T12:00:40Z",
        },
      ],
      [
        "checkpoint_2",
        {
          name: "checkpoint_2",
          status: "approved",
          started_at: "2026-05-19T12:00:40Z",
          completed_at: "2026-05-19T12:00:45Z",
        },
      ],
    ]);

    expect(stageElapsedLabel(matchRoleSteps, byName, null, nowMs)).toBe("Took 25s");
  });
});

describe("reviewFindingsSummary", () => {
  it("parses review_findings details", () => {
    const summary = reviewFindingsSummary([
      {
        stage: "content_reviewer",
        kind: "review_findings",
        message: "Review complete",
        details: { high: 2, low: 3, passed: false },
      },
    ]);
    expect(summary).toEqual({ high: 2, low: 3, passed: false });
  });
});
