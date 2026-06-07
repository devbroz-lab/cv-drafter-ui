import { describe, expect, it } from "vitest";

import {
  formatElapsedMs,
  reviewFindingsSummary,
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
