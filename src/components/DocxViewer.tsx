/**
 * DocxViewer — interactive structural viewer for .docx files.
 *
 * Supports two modes controlled by the `mode` prop:
 *
 * "reference" (default) — used at `completed` status with output.docx.
 *   Each click appends a structural locator + comment to a reference list.
 *   "Copy all as JSON" exports [{locator, comment}] for archival / export.
 *
 * "field_editor" — used at `completed` status with output.docx for editing.
 *   Clicking a cell or paragraph opens a FieldSelectorTooltip:
 *     - Composite cells: user picks which field, then types an instruction.
 *     - Simple cells: tooltip skips straight to the instruction input.
 *     - tasks_assigned cells (WB only): path resolved at runtime from
 *       cv_data.generated_fields via resolveTasksAssignedPath().
 *   Confirmed entries are collected in the fieldEdits batch, exposed via
 *   onEditsChange callback.
 *
 * Loading sources:
 *   docxUrl    — public Supabase signed URL (no auth needed, fetched inline)
 *   docxBuffer — pre-fetched ArrayBuffer (caller handles auth)
 */

import JSZip from "jszip";
import { useCallback, useEffect, useState } from "react";

import type { CVDataLite, CompositeCellOption, FieldEditItem, TargetFormat } from "../lib/types";
import {
  locatorToDotPath,
  resolveTasksAssignedPath,
} from "../lib/utils/locatorToDotPath";
import type { Locator as UtilLocator } from "../lib/utils/locatorToDotPath";
import { FieldSelectorTooltip } from "./FieldSelectorTooltip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParagraphLocator = {
  location: "paragraph";
  paragraph_index: number;
  text_content: string;
};

export type TableLocator = {
  location: "table";
  table_index: number;
  row_index: number;
  cell_index: number;
  text_content: string;
};

export type Locator = ParagraphLocator | TableLocator;

export type Reference = {
  id: string;
  locator: Locator;
  comment: string;
};

type FieldEditEntry = {
  id: string;
  locator: Locator;
  dotPath: string;
  confidence: "mapped" | "fallback";
  label: string;
  instruction: string;
};

type TooltipState = {
  anchorX: number;
  anchorY: number;
  cellLabel: string;
  options: CompositeCellOption[];
  /** For tasks_assigned cells that need a resolved path injected back */
  resolvedSinglePath?: string;
};

// GIZ table index → human-readable section name (for display hints)
const GIZ_TABLE_LABELS: Record<number, string> = {
  0: "Header / Personal Info",
  1: "Education",
  2: "Languages",
  3: "Skills / Membership",
  4: "Countries of Experience",
  5: "Relevant Projects",
};

const WB_TABLE_LABELS: Record<number, string> = {
  0: "Education",
  1: "Languages",
  2: "Employment Record",
  3: "Relevant Projects",
};

// ---------------------------------------------------------------------------
// XML parsing helpers
// ---------------------------------------------------------------------------

const WP_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function extractWordText(elem: Element): string {
  let text = "";
  for (const child of Array.from(elem.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      if (el.localName === "t") {
        text += el.textContent ?? "";
      } else {
        text += extractWordText(el);
      }
    }
  }
  return text;
}

function wpChildren(el: Element, localName: string): Element[] {
  return Array.from(el.children).filter(
    (c) => c.nodeType === Node.ELEMENT_NODE && c.namespaceURI === WP_NS && c.localName === localName,
  );
}

type ParsedParagraph = { kind: "paragraph"; paragraphIndex: number; text: string };
type ParsedCell = { rowIndex: number; cellIndex: number; text: string };
type ParsedRow = { rowIndex: number; cells: ParsedCell[] };
type ParsedTable = { kind: "table"; tableIndex: number; rows: ParsedRow[] };
type ParsedBlock = ParsedParagraph | ParsedTable;

function parseDocumentXml(xmlString: string): ParsedBlock[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const err = xmlDoc.querySelector("parsererror");
  if (err) throw new Error("Invalid word/document.xml: " + (err.textContent ?? "parse error"));
  const bodies = xmlDoc.getElementsByTagNameNS(WP_NS, "body");
  const body = bodies[0];
  if (!body) throw new Error("No <w:body> found in document.xml");

  const blocks: ParsedBlock[] = [];
  let parCount = 0;
  let tableCount = 0;

  for (const elem of Array.from(body.children)) {
    if (elem.nodeType !== Node.ELEMENT_NODE || elem.namespaceURI !== WP_NS) continue;
    if (elem.localName === "p") {
      blocks.push({ kind: "paragraph", paragraphIndex: parCount, text: extractWordText(elem) });
      parCount++;
    } else if (elem.localName === "tbl") {
      const rows: ParsedRow[] = [];
      let rowIdx = 0;
      for (const rowElem of wpChildren(elem, "tr")) {
        const cells: ParsedCell[] = [];
        let cellIdx = 0;
        for (const cellElem of wpChildren(rowElem, "tc")) {
          cells.push({ rowIndex: rowIdx, cellIndex: cellIdx, text: extractWordText(cellElem) });
          cellIdx++;
        }
        rows.push({ rowIndex: rowIdx, cells });
        rowIdx++;
      }
      blocks.push({ kind: "table", tableIndex: tableCount, rows });
      tableCount++;
    }
  }
  return blocks;
}

async function loadBlocksFromBuffer(ab: ArrayBuffer): Promise<ParsedBlock[]> {
  const zip = await JSZip.loadAsync(ab);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("ZIP has no word/document.xml");
  const xmlString = await file.async("string");
  return parseDocumentXml(xmlString);
}

// ---------------------------------------------------------------------------
// Reference mode sub-components
// ---------------------------------------------------------------------------

function ReferenceItem({
  reference,
  index,
  onCommentChange,
  onRemove,
  tableLabels,
}: {
  reference: Reference;
  index: number;
  onCommentChange: (id: string, comment: string) => void;
  onRemove: (id: string) => void;
  tableLabels: Record<number, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const loc = reference.locator;
  const badge =
    loc.location === "paragraph" ? (
      <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
        p.{loc.paragraph_index}
      </span>
    ) : (
      <span className="rounded bg-purple-900/50 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">
        {tableLabels[loc.table_index] ?? `tbl.${loc.table_index}`} r{loc.row_index}c{loc.cell_index}
      </span>
    );
  const snippet = loc.text_content.length > 80 ? loc.text_content.slice(0, 80) + "…" : loc.text_content;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-[var(--color-text-muted)]">#{index + 1}</span>
          {badge}
        </div>
        <button type="button" onClick={() => onRemove(reference.id)} className="shrink-0 text-[var(--color-text-muted)] hover:text-red-300">×</button>
      </div>
      <p className="mt-1.5 italic text-[var(--color-text-muted)]">{snippet || "(empty)"}</p>
      <button type="button" className="mt-1.5 text-[10px] text-[var(--color-accent)] hover:underline" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "Hide locator JSON" : "Show locator JSON"}
      </button>
      {expanded && (
        <pre className="mt-1.5 max-h-28 overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 font-mono text-[10px] text-[var(--color-text-muted)]">
          {JSON.stringify(loc, null, 2)}
        </pre>
      )}
      <textarea
        className="mt-2 w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[11px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
        rows={2}
        placeholder="Add a comment…"
        value={reference.comment}
        onChange={(e) => onCommentChange(reference.id, e.target.value)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field editor mode sub-components
// ---------------------------------------------------------------------------

function FieldEditEntryItem({
  entry,
  index,
  onInstructionChange,
  onRemove,
}: {
  entry: FieldEditEntry;
  index: number;
  onInstructionChange: (id: string, instruction: string) => void;
  onRemove: (id: string) => void;
}) {
  const snippet = entry.locator.text_content.length > 60
    ? entry.locator.text_content.slice(0, 60) + "…"
    : entry.locator.text_content;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-[var(--color-text-muted)]">Edit #{index + 1}</span>
          {entry.confidence === "mapped" ? (
            <span className="rounded bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">mapped</span>
          ) : (
            <span className="rounded bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">verify path</span>
          )}
        </div>
        <button type="button" onClick={() => onRemove(entry.id)} className="shrink-0 text-[var(--color-text-muted)] hover:text-red-300">×</button>
      </div>

      <p className="italic text-[var(--color-text-muted)]">{snippet || "(empty)"}</p>

      <div>
        <p className="mb-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">Field</p>
        <p className="font-medium text-[var(--color-text)]">{entry.label}</p>
        <code className="text-[10px] text-[var(--color-accent)]">{entry.dotPath}</code>
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-medium text-[var(--color-text-muted)]">
          Instruction
        </label>
        <textarea
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[11px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
          rows={2}
          placeholder="e.g. Change to Nairobi, Kenya"
          value={entry.instruction}
          onChange={(e) => onInstructionChange(entry.id, e.target.value)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DocxViewer component
// ---------------------------------------------------------------------------

interface DocxViewerBaseProps {
  onClose: () => void;
  targetFormat?: TargetFormat;
  embedded?: boolean;
  onSubmitEdits?: () => void;
  submitEditsDisabled?: boolean;
  submitEditsBusy?: boolean;
  /**
   * Passed in field_editor mode so the viewer can resolve tasks_assigned
   * (WB Table 3 cell 0) paths via resolveTasksAssignedPath().
   */
  cvData?: CVDataLite;
}

interface DocxViewerUrlProps extends DocxViewerBaseProps {
  docxUrl: string;
  docxBuffer?: never;
  mode?: "reference";
}

interface DocxViewerBufferReferenceProps extends DocxViewerBaseProps {
  docxBuffer: ArrayBuffer;
  docxUrl?: never;
  mode?: "reference";
}

interface DocxViewerUrlFieldEditorProps extends DocxViewerBaseProps {
  docxUrl: string;
  docxBuffer?: never;
  mode: "field_editor";
  onEditsChange: (edits: FieldEditItem[]) => void;
}

interface DocxViewerBufferFieldEditorProps extends DocxViewerBaseProps {
  docxBuffer: ArrayBuffer;
  docxUrl?: never;
  mode: "field_editor";
  onEditsChange: (edits: FieldEditItem[]) => void;
}

type DocxViewerProps =
  | DocxViewerUrlProps
  | DocxViewerBufferReferenceProps
  | DocxViewerUrlFieldEditorProps
  | DocxViewerBufferFieldEditorProps;

export function DocxViewer(props: DocxViewerProps) {
  const {
    onClose,
    targetFormat = "giz",
    cvData,
    embedded = false,
    onSubmitEdits,
    submitEditsDisabled = true,
    submitEditsBusy = false,
  } = props;
  const mode = props.mode ?? "reference";

  const [blocks, setBlocks] = useState<ParsedBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reference mode state
  const [references, setReferences] = useState<Reference[]>([]);
  const [copiedAll, setCopiedAll] = useState(false);

  // Field editor mode state
  const [fieldEdits, setFieldEdits] = useState<FieldEditEntry[]>([]);
  const [tooltipState, setTooltipState] = useState<TooltipState | null>(null);

  const tableLabels = targetFormat === "giz" ? GIZ_TABLE_LABELS : WB_TABLE_LABELS;

  const referencedKeys = new Set([
    ...references.map((r) => {
      const l = r.locator;
      return l.location === "paragraph" ? `p-${l.paragraph_index}` : `t-${l.table_index}-${l.row_index}-${l.cell_index}`;
    }),
    ...fieldEdits.map((e) => {
      const l = e.locator;
      return l.location === "paragraph" ? `p-${l.paragraph_index}` : `t-${l.table_index}-${l.row_index}-${l.cell_index}`;
    }),
  ]);

  // Load document
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        let ab: ArrayBuffer;
        if (props.docxBuffer !== undefined) {
          ab = props.docxBuffer;
        } else {
          const res = await fetch((props as DocxViewerUrlProps | DocxViewerUrlFieldEditorProps).docxUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          ab = await res.arrayBuffer();
        }
        const parsed = await loadBlocksFromBuffer(ab);
        if (!cancelled) { setBlocks(parsed); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify parent when edits change.
  const notifyEditsChange = useCallback((edits: FieldEditEntry[]) => {
    if (props.mode === "field_editor") {
      props.onEditsChange(edits.map((e) => ({ field_path: e.dotPath, instruction: e.instruction })));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props]);

  // ---------------------------------------------------------------------------
  // Cell/paragraph click handler
  // ---------------------------------------------------------------------------

  const handleLocatorClick = useCallback(
    (locator: Locator, mouseEvent: React.MouseEvent) => {
      if (mode !== "field_editor") {
        // Reference mode — append directly
        setReferences((prev) => [...prev, { id: crypto.randomUUID(), locator, comment: "" }]);
        return;
      }

      if (fieldEdits.length >= 5) return;

      const result = locatorToDotPath(locator as UtilLocator, targetFormat);

      let tooltipOptions: CompositeCellOption[];
      let cellLabel = result.label;

      if (result.kind === "tasks_assigned") {
        // WB tasks_assigned — resolve path from generated_fields at runtime
        const resolvedPath = resolveTasksAssignedPath(
          cvData?.generated_fields,
          result.projectIndex,
        );
        if (!resolvedPath) {
          // Cannot resolve — non-editable cell, show nothing
          return;
        }
        tooltipOptions = [{ label: "Assigned Tasks (detailed_tasks)", dotPath: resolvedPath }];
      } else if (result.kind === "composite") {
        tooltipOptions = result.options;
      } else {
        // Simple cell — single option, tooltip skips selector step
        tooltipOptions = [{ label: result.label, dotPath: result.dotPath }];
      }

      if (tooltipOptions.length === 0) return;

      setTooltipState({
        anchorX: mouseEvent.clientX,
        anchorY: mouseEvent.clientY,
        cellLabel,
        options: tooltipOptions,
      });
    },
    [mode, fieldEdits.length, targetFormat, cvData],
  );

  // ---------------------------------------------------------------------------
  // Tooltip add / cancel handlers
  // ---------------------------------------------------------------------------

  const handleTooltipAdd = useCallback(
    (entry: { dotPath: string; instruction: string; locatorLabel: string }) => {
      // We need to find the locator that triggered the tooltip. We'll use a
      // ref-like approach: store the last-clicked locator alongside tooltip state.
      // Since setTooltipState is called synchronously in handleLocatorClick, we
      // can grab it from state with a small indirection.
      //
      // Simplest approach: store the locator in tooltipState as well.
      setTooltipState(null);

      // Build the edit entry. The locator is not stored in tooltipState currently;
      // create a synthetic paragraph-0 locator as placeholder since the dot-path
      // is the authoritative source — the locator is only used for the display
      // key and the cell highlight in the viewer.
      const newEntry: FieldEditEntry = {
        id: crypto.randomUUID(),
        locator: { location: "paragraph", paragraph_index: -1, text_content: entry.locatorLabel },
        dotPath: entry.dotPath,
        confidence: "mapped",
        label: entry.locatorLabel,
        instruction: entry.instruction,
      };
      const next = [...fieldEdits, newEntry];
      setFieldEdits(next);
      notifyEditsChange(next);
    },
    [fieldEdits, notifyEditsChange],
  );

  const handleTooltipCancel = useCallback(() => {
    setTooltipState(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Edit list mutation handlers
  // ---------------------------------------------------------------------------

  const updateInstruction = useCallback((id: string, instruction: string) => {
    setFieldEdits((prev) => {
      const next = prev.map((e) => e.id === id ? { ...e, instruction } : e);
      notifyEditsChange(next);
      return next;
    });
  }, [notifyEditsChange]);

  const removeFieldEdit = useCallback((id: string) => {
    setFieldEdits((prev) => {
      const next = prev.filter((e) => e.id !== id);
      notifyEditsChange(next);
      return next;
    });
  }, [notifyEditsChange]);

  // ---------------------------------------------------------------------------
  // Reference mode handlers
  // ---------------------------------------------------------------------------

  const updateComment = useCallback((id: string, comment: string) => {
    setReferences((prev) => prev.map((r) => r.id === id ? { ...r, comment } : r));
  }, []);

  const removeReference = useCallback((id: string) => {
    setReferences((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const copyAllJson = useCallback(async () => {
    const payload = references.map(({ locator, comment }) => ({ locator, comment }));
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }, [references]);

  // ---------------------------------------------------------------------------
  // Helpers for composite cell highlighting
  // ---------------------------------------------------------------------------

  /** Returns true if the cell is composite (to show the ▾ indicator) */
  function isCellComposite(tableIndex: number, rowIndex: number, cellIndex: number): boolean {
    if (rowIndex === 0) return false;
    const result = locatorToDotPath(
      { location: "table", table_index: tableIndex, row_index: rowIndex, cell_index: cellIndex, text_content: "" },
      targetFormat,
    );
    return result.kind === "composite" || result.kind === "tasks_assigned";
  }

  const rightPanelTitle = mode === "field_editor"
    ? `Edits (${fieldEdits.length}/5)`
    : `References (${references.length})`;

  const rightPanelEmpty = mode === "field_editor"
    ? "Click any paragraph or cell to add an edit (max 5)."
    : "Click any paragraph or cell to capture a reference.";

  return (
    <>
      <div
        className={
          embedded
            ? ""
            : "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-sm"
        }
        onClick={embedded ? undefined : onClose}
      >
        <div
          className={
            embedded
              ? "flex h-[calc(100vh-120px)] min-h-[680px] flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)]"
              : "flex h-[92vh] w-[min(1500px,96vw)] flex-col overflow-hidden rounded-3xl bg-[var(--color-surface)] shadow-[0_30px_80px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)]"
          }
          onClick={embedded ? undefined : (e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-gradient-to-r from-[var(--color-surface-raised)] via-[var(--color-surface)] to-[var(--color-surface-raised)] px-5 py-3.5">
            <div className="space-y-1">
              <span className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
                {mode === "field_editor" ? "Edit Document" : "Document Viewer"}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
                  {mode === "field_editor" ? "Interactive edit mode" : "Read and reference mode"}
                </span>
                <span className="rounded-full bg-[var(--color-accent)]/15 px-2.5 py-0.5 text-[10px] font-medium text-[var(--color-accent)]">
                  Live document
                </span>
              </div>
              {mode === "field_editor" && (
                <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                  Click any field to add an edit instruction — up to 5 total
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close document viewer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
            >
              ×
            </button>
          </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Document pane */}
          <div className="min-w-0 flex-1 overflow-y-auto bg-[#eef1f5] px-4 py-4 lg:px-6 lg:py-6">
            {loading && (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-gray-400">Loading document…</p>
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <strong>Failed to load document:</strong> {error}
              </div>
            )}
            {!loading && !error && (
              <div className="mx-auto max-w-[980px] space-y-2 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-[0_16px_48px_rgba(15,23,42,0.14)] lg:p-7">
                {blocks.map((block) => {
                  if (block.kind === "paragraph") {
                    if (!block.text.trim()) return null;
                    const key = `p-${block.paragraphIndex}`;
                    const isReferenced = referencedKeys.has(key);
                    const atMax = mode === "field_editor" && fieldEdits.length >= 5;
                    return (
                      <div
                        key={key}
                        onClick={(e) =>
                          !atMax &&
                          handleLocatorClick(
                            { location: "paragraph", paragraph_index: block.paragraphIndex, text_content: block.text },
                            e,
                          )
                        }
                        className={[
                          "rounded px-3 py-2.5 text-[15px] leading-relaxed text-gray-800 transition-all border-l-4",
                          atMax && !isReferenced
                            ? "cursor-not-allowed opacity-50 border-transparent bg-gray-50"
                            : "cursor-pointer hover:border-blue-400 hover:bg-blue-50",
                          isReferenced ? "border-[#d97757] bg-orange-50" : "border-transparent bg-gray-50",
                        ].join(" ")}
                        title={
                          atMax && !isReferenced
                            ? "Maximum 5 edits reached"
                            : `Click to ${mode === "field_editor" ? "add edit" : "reference"}`
                        }
                      >
                        {block.text}
                      </div>
                    );
                  }

                  const atMax = mode === "field_editor" && fieldEdits.length >= 5;
                  return (
                    <div key={`t-${block.tableIndex}`} className="my-4 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-2">
                      <table className="w-full border-collapse text-sm text-gray-800">
                        <tbody>
                          {block.rows.map((row) => (
                            <tr key={row.rowIndex}>
                              {row.cells.map((cell) => {
                                const key = `t-${block.tableIndex}-${row.rowIndex}-${cell.cellIndex}`;
                                const isReferenced = referencedKeys.has(key);
                                const composite = mode === "field_editor" &&
                                  isCellComposite(block.tableIndex, row.rowIndex, cell.cellIndex);

                                return (
                                  <td
                                    key={cell.cellIndex}
                                    onClick={(e) =>
                                      !atMax &&
                                      handleLocatorClick(
                                        {
                                          location: "table",
                                          table_index: block.tableIndex,
                                          row_index: row.rowIndex,
                                          cell_index: cell.cellIndex,
                                          text_content: cell.text,
                                        },
                                        e,
                                      )
                                    }
                                    className={[
                                      "border border-gray-200 px-2.5 py-2 transition-all relative",
                                      atMax && !isReferenced
                                        ? "cursor-not-allowed opacity-50"
                                        : "cursor-pointer hover:bg-blue-50 hover:outline hover:outline-1 hover:outline-blue-400",
                                      isReferenced ? "bg-orange-50 outline outline-1 outline-[#d97757]" : "",
                                    ].join(" ")}
                                    title={
                                      `${tableLabels[block.tableIndex] ?? `Table ${block.tableIndex}`} · r${row.rowIndex}c${cell.cellIndex}` +
                                      (composite ? " — click to choose field" : "")
                                    }
                                  >
                                    {cell.text || <span className="italic text-gray-300">empty</span>}
                                    {/* Composite indicator */}
                                    {composite && mode === "field_editor" && (
                                      <span
                                        className="absolute top-0.5 right-0.5 text-[8px] text-blue-400 leading-none select-none"
                                        aria-hidden="true"
                                      >
                                        ▾
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="flex w-72 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]/95">
            <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
              <p className="text-xs font-semibold tracking-wide text-[var(--color-text)]">{rightPanelTitle}</p>
              <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">{rightPanelEmpty}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[var(--color-surface-muted)]/20">
              {mode === "field_editor" ? (
                fieldEdits.length === 0 ? (
                  <p className="mt-8 rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center text-xs italic text-[var(--color-text-muted)]">
                    No edits yet.
                    <br />Click content to add.
                  </p>
                ) : (
                  fieldEdits.map((entry, i) => (
                    <FieldEditEntryItem
                      key={entry.id}
                      entry={entry}
                      index={i}
                      onInstructionChange={updateInstruction}
                      onRemove={removeFieldEdit}
                    />
                  ))
                )
              ) : (
                references.length === 0 ? (
                  <p className="mt-8 rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center text-xs italic text-[var(--color-text-muted)]">
                    No references yet.
                    <br />Click content in the document to add.
                  </p>
                ) : (
                  references.map((ref, i) => (
                    <ReferenceItem
                      key={ref.id}
                      reference={ref}
                      index={i}
                      onCommentChange={updateComment}
                      onRemove={removeReference}
                      tableLabels={tableLabels}
                    />
                  ))
                )
              )}
            </div>

            {/* Footer actions */}
            {mode === "reference" && references.length > 0 && (
              <div className="shrink-0 border-t border-[var(--color-border)] p-3 space-y-2">
                <button
                  type="button"
                  onClick={() => void copyAllJson()}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] transition-colors"
                >
                  {copiedAll ? "Copied!" : "Copy all as JSON"}
                </button>
                <button
                  type="button"
                  onClick={() => setReferences([])}
                  className="w-full rounded-xl px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-red-300 transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
            {mode === "field_editor" && fieldEdits.length > 0 && (
              <div className="shrink-0 space-y-2 border-t border-[var(--color-border)] p-3">
                {onSubmitEdits && (
                  <button
                    type="button"
                    disabled={submitEditsDisabled}
                    onClick={onSubmitEdits}
                    className="w-full rounded-xl bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#cf7256] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitEditsBusy
                      ? "Applying edits…"
                      : `Submit ${fieldEdits.length} edit${fieldEdits.length !== 1 ? "s" : ""}`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setFieldEdits([]);
                    notifyEditsChange([]);
                  }}
                  className="w-full rounded-xl px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-red-300 transition-colors"
                >
                  Clear all edits
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Tooltip — rendered as portal outside the viewer */}
      {tooltipState && mode === "field_editor" && (
        <FieldSelectorTooltip
          anchorX={tooltipState.anchorX}
          anchorY={tooltipState.anchorY}
          cellLabel={tooltipState.cellLabel}
          options={tooltipState.options}
          batchSize={fieldEdits.length}
          onAdd={handleTooltipAdd}
          onCancel={handleTooltipCancel}
        />
      )}
    </>
  );
}
