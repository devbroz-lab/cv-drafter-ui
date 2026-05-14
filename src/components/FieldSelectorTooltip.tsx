/**
 * FieldSelectorTooltip
 *
 * Portal-positioned tooltip opened when the user clicks a cell in DocxViewer
 * (field_editor mode). Handles two cases:
 *
 *   1. Composite cell  — shows a labelled list of field options first, then
 *                        transitions to the instruction input after the user
 *                        picks one (same flow for 2 fields or 7).
 *   2. Simple cell     — skips directly to the instruction input (options
 *                        array has exactly one entry).
 *
 * The tooltip is anchored via `position: fixed` at the click coordinates,
 * clamped to the viewport so it never overflows off-screen.
 *
 * On confirm → calls onAdd({ dotPath, instruction, locatorLabel }).
 * On cancel / Escape / click-outside → calls onCancel.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CompositeCellOption } from "../lib/types";

// ---------------------------------------------------------------------------
// Badge color helpers (same color per tooltip instance)
// ---------------------------------------------------------------------------

function hashStringToHue(input: string): number {
  // Simple deterministic hash → hue in [0, 359]
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function badgeStylesFromKey(key: string): { style: React.CSSProperties; ring: string } {
  const hue = hashStringToHue(key);
  // Dark theme friendly HSLs
  const bg = `hsla(${hue}, 80%, 55%, 0.14)`;
  const border = `hsla(${hue}, 80%, 60%, 0.28)`;
  const text = `hsl(${hue}, 85%, 75%)`;
  return {
    style: {
      backgroundColor: bg,
      borderColor: border,
      color: text,
    },
    ring: `hsla(${hue}, 80%, 60%, 0.18)`,
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FieldSelectorTooltipProps {
  anchorX: number;
  anchorY: number;
  /** Human label of the clicked cell, shown as header */
  cellLabel: string;
  /**
   * Options for the user to choose from.
   * Length === 1 → simple cell, skip selector phase.
   * Length > 1   → composite cell, show selector first.
   */
  options: CompositeCellOption[];
  /** Current number of edits in the batch (for the 5/5 cap check) */
  batchSize: number;
  /** True when re-opening an existing batch entry for modification */
  isEditing?: boolean;
  /** Pre-selected option when re-opening an existing edit */
  initialSelectedOption?: CompositeCellOption;
  /** Pre-filled instruction when re-opening an existing edit */
  initialInstruction?: string;
  /** Pre-filled instruction for the chosen sub-field when re-opening this cell */
  initialInstructionsByPath?: Record<string, string>;
  onAdd: (entry: { dotPath: string; instruction: string; locatorLabel: string }) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BATCH = 5;
const TOOLTIP_WIDTH = 320;
const TOOLTIP_APPROX_HEIGHT = 240;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FieldSelectorTooltip({
  anchorX,
  anchorY,
  cellLabel,
  options,
  batchSize,
  isEditing = false,
  initialSelectedOption,
  initialInstruction,
  initialInstructionsByPath,
  onAdd,
  onCancel,
}: FieldSelectorTooltipProps) {
  const [selectedOption, setSelectedOption] = useState<CompositeCellOption | null>(
    initialSelectedOption ?? (options.length === 1 ? options[0] : null),
  );
  const [instruction, setInstruction] = useState(initialInstruction ?? "");
  const tooltipRef = useRef<HTMLDivElement>(null);
  const instructionRef = useRef<HTMLTextAreaElement>(null);

  // One shared color for this tooltip instance (ties multiple fields together)
  const badge = badgeStylesFromKey(cellLabel);

  // Auto-focus the instruction textarea when we enter that step.
  useEffect(() => {
    if (selectedOption && instructionRef.current) {
      instructionRef.current.focus();
    }
  }, [selectedOption]);

  // Close on Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  // Close on click-outside.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    // Slight delay so the originating cell click doesn't immediately close the tooltip.
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [onCancel]);

  // Clamp position to viewport.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(anchorX, vw - TOOLTIP_WIDTH - 12);
  const top = anchorY + TOOLTIP_APPROX_HEIGHT > vh
    ? anchorY - TOOLTIP_APPROX_HEIGHT - 4
    : anchorY + 8;

  const isBatchFull = !isEditing && batchSize >= MAX_BATCH;
  const canAdd = !isBatchFull && !!selectedOption && instruction.trim().length > 0;

  const handleAdd = () => {
    if (!canAdd || !selectedOption) return;
    onAdd({
      dotPath: selectedOption.dotPath,
      instruction: instruction.trim(),
      locatorLabel: selectedOption.label,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  return createPortal(
    <div
      ref={tooltipRef}
      style={{ position: "fixed", left, top, width: TOOLTIP_WIDTH, zIndex: 9999 }}
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-[var(--color-text)] truncate">{cellLabel}</span>
          {isEditing && (
            <span className="shrink-0 rounded bg-blue-900/50 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
              editing
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="ml-2 shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3">
        {/* Step 1 — pick sub-field (composite cells: more than one option) */}
        {options.length > 1 && !selectedOption && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Select field to edit
            </p>
            {options.map((opt) => (
              <button
                key={opt.dotPath}
                type="button"
                onClick={() => {
                  setSelectedOption(opt);
                  setInstruction(initialInstructionsByPath?.[opt.dotPath] ?? "");
                }}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-left text-xs text-[var(--color-text)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{opt.label}</span>
                    <code className="mt-0.5 block font-mono text-[10px] leading-snug text-[var(--color-text-muted)] break-all">
                      {opt.dotPath}
                    </code>
                  </div>
                  <span
                    className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                    style={badge.style}
                    aria-hidden="true"
                  >
                    field
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2 — Instruction input */}
        {selectedOption && (
          <div className="space-y-2">
            {/* Selected field label */}
            <div className="rounded-lg bg-[var(--color-bg)] px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-medium text-[var(--color-text-muted)]">
                  Editing field
                </p>
                {options.length > 1 && (
                  <span
                    className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                    style={badge.style}
                    title="This field belongs to this dialog"
                  >
                    {selectedOption.label}
                  </span>
                )}
              </div>
              <p className="mt-0.5 font-medium text-[var(--color-text)]">{selectedOption.label}</p>
              <code className="mt-0.5 block min-w-0 break-all text-[10px] leading-snug text-[var(--color-accent)]">
                {selectedOption.dotPath}
              </code>
            </div>

            {/* "Back" link for composite cells */}
            {options.length > 1 && (
              <button
                type="button"
                onClick={() => { setSelectedOption(null); setInstruction(""); }}
                className="text-[10px] text-[var(--color-accent)] hover:underline"
              >
                ← Choose a different field
              </button>
            )}

            {/* Instruction textarea */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-[var(--color-text-muted)]">
                Edit instruction
              </label>
              <textarea
                ref={instructionRef}
                rows={3}
                className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                placeholder="e.g. Make this more concise and remove passive voice"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                Enter to add · Shift+Enter for new line
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!canAdd}
                onClick={handleAdd}
                className={[
                  "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  isBatchFull
                    ? "cursor-not-allowed bg-[var(--color-border)] text-[var(--color-text-muted)]"
                    : canAdd
                    ? "bg-[var(--color-accent)] text-white hover:opacity-90"
                    : "cursor-not-allowed bg-[var(--color-border)] text-[var(--color-text-muted)]",
                ].join(" ")}
              >
                {isBatchFull ? "Batch full (5/5)" : isEditing ? "Update edit" : "Add to batch"}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
