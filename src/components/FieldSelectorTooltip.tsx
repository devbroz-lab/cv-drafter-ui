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
 * clamped to the viewport. When there is not enough room below, it flips above
 * the point using translateY(-100%) so short popovers stay tight to the click
 * (we do not assume the shell is always max-height tall).
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
/** Max tooltip height — must fit in viewport; body scrolls inside. */
const TOOLTIP_MAX_HEIGHT_PX = 560;

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

  // Clamp to viewport using capped height (real content can be taller; shell scrolls).
  const vw = typeof window !== "undefined" ? window.innerWidth : 800;
  const vh = typeof window !== "undefined" ? window.innerHeight : 600;
  const margin = 12;
  const gap = 8;
  const maxH = Math.min(TOOLTIP_MAX_HEIGHT_PX, vh - margin * 2);
  let left = Math.min(Math.max(margin, anchorX), vw - TOOLTIP_WIDTH - margin);

  const bottomLimit = vh - margin;
  const fitsBelow = anchorY + gap + maxH <= bottomLimit;
  const fitsAboveWorstCase = anchorY - gap - maxH >= margin;

  let top: number;
  let transform: string | undefined;
  if (fitsBelow) {
    top = anchorY + gap;
    transform = undefined;
  } else if (fitsAboveWorstCase) {
    // Bottom edge of popover sits `gap` px above the anchor (height-agnostic).
    top = anchorY - gap;
    transform = "translateY(-100%)";
  } else {
    // Very little vertical space: pin to viewport; inner area scrolls.
    top = Math.max(margin, bottomLimit - maxH);
    transform = undefined;
  }

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
      style={{
        position: "fixed",
        left,
        top,
        transform,
        width: TOOLTIP_WIDTH,
        maxHeight: maxH,
        zIndex: 9999,
        background: "var(--editor-popover-bg)",
      }}
      className="flex flex-col overflow-hidden rounded-2xl border border-[var(--editor-chrome-border)] text-xs text-[var(--color-text)] shadow-[var(--shadow-md)]"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--editor-chrome-border)] bg-[var(--editor-chrome-header-bg)] px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[12px] font-semibold tracking-tight text-[var(--color-text)]">
            {cellLabel}
          </span>
          {isEditing && (
            <span className="docx-viewer__badge shrink-0">editing</span>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-[var(--color-text-muted)] transition-colors hover:border-white/[0.08] hover:bg-white/[0.06] hover:text-[var(--color-text)]"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Scrollable body (keeps footer actions on-screen) */}
      <div className="editor-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden bg-[var(--color-bg)]/40 p-3.5">
        {/* Step 1 — pick sub-field (composite cells: more than one option) */}
        {options.length > 1 && !selectedOption && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
              Select field
            </p>
            {options.map((opt) => (
              <button
                key={opt.dotPath}
                type="button"
                onClick={() => {
                  setSelectedOption(opt);
                  setInstruction(initialInstructionsByPath?.[opt.dotPath] ?? "");
                }}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-left text-[12px] text-[var(--color-text)] transition-colors duration-150 hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-surface-raised)] active:scale-[0.99]"
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

        {/* Step 2 — field context + instruction (actions live in sticky footer below) */}
        {selectedOption && (
          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                Editing field
              </p>
              <p
                className="mt-2 text-[13px] font-medium leading-snug text-[var(--color-text)]"
                title={selectedOption.label}
              >
                {selectedOption.label}
              </p>
              <code className="mt-2 block min-w-0 break-all rounded-md bg-[var(--color-bg)]/60 px-2 py-1 font-mono text-[10px] leading-snug text-[var(--color-accent)]">
                {selectedOption.dotPath}
              </code>
            </div>

            {options.length > 1 && (
              <button
                type="button"
                onClick={() => { setSelectedOption(null); setInstruction(""); }}
                className="block text-left text-[11px] font-medium text-[var(--color-accent)] transition-opacity hover:opacity-80"
              >
                ← Choose a different field
              </button>
            )}

            <div className="pt-0.5">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                Edit instruction
              </label>
              <textarea
                ref={instructionRef}
                rows={3}
                className="editor-instruction-input px-3 py-2"
                placeholder="e.g. Make this more concise and remove passive voice"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                Enter to add · Shift+Enter for new line
              </p>
            </div>
          </div>
        )}
      </div>

      {selectedOption && (
        <div className="flex shrink-0 gap-2 border-t border-white/[0.08] bg-[var(--color-bg)]/95 px-3.5 py-3">
          <button
            type="button"
            disabled={!canAdd}
            onClick={handleAdd}
            className={[
              "flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-all duration-200 active:scale-[0.99]",
              isBatchFull
                ? "cursor-not-allowed bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"
                : canAdd
                ? "bg-gradient-to-b from-[#e89572] to-[var(--color-accent)] text-white shadow-[0_6px_20px_-4px_rgba(217,119,87,0.5)] hover:brightness-[1.05]"
                : "cursor-not-allowed bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]",
            ].join(" ")}
          >
            {isBatchFull ? "Batch full (5/5)" : isEditing ? "Update edit" : "Add to batch"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[12px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text)]"
          >
            Cancel
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
