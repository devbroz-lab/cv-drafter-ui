import type { AppliedEditItem, FieldEditItem, SkippedEditItem } from "./types";

/** Human-readable label for a CV dot-path. */
export function formatFieldPath(path: string): string {
  return path
    .replace(/\[(\d+)\]/g, (_, i) => ` ${Number(i) + 1}`)
    .replace(/\./g, " › ")
    .replace(/_/g, " ");
}

export function normalizeApplied(item: string | AppliedEditItem): AppliedEditItem {
  if (typeof item === "string") {
    return { path: item };
  }
  return item;
}

export function normalizeSkipped(item: string | SkippedEditItem): SkippedEditItem {
  if (typeof item === "string") {
    return { path: item };
  }
  return item;
}

export function instructionForPath(
  path: string,
  submitted: FieldEditItem[],
): string | undefined {
  const match = submitted.find(
    (e) => e.field_path === path || e.field_path.trim() === path.trim(),
  );
  return match?.instruction?.trim() || undefined;
}
