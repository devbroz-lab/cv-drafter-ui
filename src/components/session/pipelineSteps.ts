import type { ManifestStep, SessionStatus } from "../../lib/types";

import { currentStepIndex, inferStepVisualState, type StepVisualState } from "./stepVisual";

/** Recruiter-facing pipeline — six stages shown in the UI. */
export const USER_PIPELINE_STAGES = [
  {
    id: "read_inputs",
    label: "Reading your CV & job requirements",
    activePhrase: "Extracting your CV and summarising the terms of reference",
    backendSteps: ["cv_extractor", "tor_summarizer"],
  },
  {
    id: "match_role",
    label: "Matching your experience to the role",
    activePhrase: "Mapping your background to the role and confirming fit",
    backendSteps: ["checkpoint_1", "cv_tor_mapper", "checkpoint_2"],
  },
  {
    id: "write_review",
    label: "Writing and reviewing your CV",
    activePhrase: "Drafting tailored fields and checking evidence",
    backendSteps: ["fields_generator", "content_reviewer"],
  },
  {
    id: "page_limit",
    label: "Fitting to page limit",
    activePhrase: "Adjusting length to meet the template page limit",
    backendSteps: ["compressor"],
  },
  {
    id: "final_review",
    label: "Final review",
    activePhrase: "Last quality pass before export",
    backendSteps: ["checkpoint_3"],
  },
  {
    id: "generate_doc",
    label: "Generating your document",
    activePhrase: "Rendering your formatted Word file",
    backendSteps: ["renderer"],
  },
] as const;

export type UserPipelineStageId = (typeof USER_PIPELINE_STAGES)[number]["id"];

export type UserPipelineStageView = {
  id: UserPipelineStageId;
  label: string;
  activePhrase: string;
  visual: StepVisualState;
};

function memberVisuals(stage: (typeof USER_PIPELINE_STAGES)[number], byName: Map<string, ManifestStep>) {
  return stage.backendSteps
    .map((name) => byName.get(name))
    .filter((s): s is ManifestStep => Boolean(s))
    .map(inferStepVisualState);
}

function stageVisual(
  visuals: StepVisualState[],
  isCurrentGroup: boolean,
  priorGroupsDone: boolean,
): StepVisualState {
  if (!visuals.length) return priorGroupsDone ? "running" : "pending";
  if (visuals.some((v) => v === "failed")) return "failed";
  if (visuals.some((v) => v === "blocked")) return "blocked";
  if (visuals.every((v) => v === "completed" || v === "approved")) return "completed";
  if (isCurrentGroup || visuals.some((v) => v === "running")) return "running";
  if (priorGroupsDone) return "running";
  return "pending";
}

/** Map backend manifest steps → six recruiter-facing stages. */
export function deriveUserPipelineStages(
  backendSteps: ManifestStep[],
  sessionStatus?: SessionStatus,
): UserPipelineStageView[] {
  const byName = new Map(backendSteps.map((s) => [s.name, s]));
  const curName = backendSteps.length ? backendSteps[currentStepIndex(backendSteps)]?.name : undefined;

  const views: UserPipelineStageView[] = [];

  for (let i = 0; i < USER_PIPELINE_STAGES.length; i++) {
    const def = USER_PIPELINE_STAGES[i];
    const visuals = memberVisuals(def, byName);
    const priorGroupsDone =
      i === 0 ||
      USER_PIPELINE_STAGES.slice(0, i).every((prev) => {
        const pv = memberVisuals(prev, byName);
        return pv.length > 0 && pv.every((v) => v === "completed" || v === "approved");
      });
    const isCurrentGroup = Boolean(
      curName && (def.backendSteps as readonly string[]).includes(curName),
    );

    views.push({
      id: def.id,
      label: def.label,
      activePhrase: def.activePhrase,
      visual: stageVisual(visuals, isCurrentGroup, priorGroupsDone),
    });
  }

  if (sessionStatus === "completed") {
    return views.map((v) => ({ ...v, visual: "completed" as const }));
  }

  if (sessionStatus === "failed" && views.every((v) => v.visual === "pending")) {
    return views.map((v, i) => (i === 0 ? { ...v, visual: "failed" as const } : v));
  }

  return views;
}

export function currentUserStageIndex(stages: UserPipelineStageView[]): number {
  for (let i = 0; i < stages.length; i++) {
    const v = stages[i].visual;
    if (v === "running" || v === "blocked" || v === "failed") return i;
    if (v === "pending") return i;
  }
  return Math.max(0, stages.length - 1);
}

export function userStageRowMode(
  stage: UserPipelineStageView,
  index: number,
  cur: number,
  celebrating: string | null,
  allDone: boolean,
): "active" | "celebrate" | "collapsed" | "blocked" | null {
  if (stage.visual === "pending" && index > cur) return null;
  if (celebrating === stage.id) return "celebrate";
  if (stage.visual === "blocked") return "blocked";
  if (allDone || stage.visual === "completed") return "collapsed";
  if (stage.visual === "running" || stage.visual === "failed" || index === cur) return "active";
  return index <= cur ? "active" : null;
}
