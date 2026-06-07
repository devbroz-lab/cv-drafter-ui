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
 * Renders the document surface, optional field-edit / reference side rail, and
 * field-selection tooltip. The parent wraps this component in a shell (e.g.
 * EditorSidePanel) for layout, backdrop, and motion.
 *
 * Loading sources:
 *   docxUrl    — public Supabase signed URL (no auth needed, fetched inline)
 *   docxBuffer — pre-fetched ArrayBuffer (caller handles auth)
 */

import JSZip from "jszip";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CVDataLite, CompositeCellOption, FieldEditItem, TargetFormat } from "../lib/types";
import {
  effectiveKeyQualifications,
  effectiveOtherRelevantInfo,
  locatorToDotPath,
  resolveTasksAssignedPath,
} from "../lib/utils/locatorToDotPath";
import type { LocatorToDotPathOptions } from "../lib/utils/locatorToDotPath";
import type { Locator as UtilLocator } from "../lib/utils/locatorToDotPath";
import { extractCellText, extractWordText, wpChildren, WP_NS } from "../lib/utils/docxParseText";
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
  locator: Locator;
  /** Prefill instruction when re-opening this cell and picking the same sub-field */
  initialInstructionsByPath?: Record<string, string>;
};

function locKey(l: Locator): string {
  return l.location === "paragraph"
    ? `p-${l.paragraph_index}`
    : `t-${l.table_index}-${l.row_index}-${l.cell_index}`;
}

// Distinct tints per edit slot (max 5). Document + rail use the same palette.
const EDIT_COLORS = [
  {
    dot: "bg-amber-400",
    cardBorder: "border-l-amber-400/65",
    railGlow: "",
    docPara: "border-l-[3px] border-l-amber-400/80 bg-amber-50/90",
    docCell: "bg-amber-50 ring-1 ring-inset ring-amber-200/35",
  },
  {
    dot: "bg-violet-400",
    cardBorder: "border-l-violet-400/65",
    railGlow: "",
    docPara: "border-l-[3px] border-l-violet-400/80 bg-violet-50/90",
    docCell: "bg-violet-50 ring-1 ring-inset ring-violet-200/35",
  },
  {
    dot: "bg-emerald-400",
    cardBorder: "border-l-emerald-400/65",
    railGlow: "",
    docPara: "border-l-[3px] border-l-emerald-400/80 bg-emerald-50/90",
    docCell: "bg-emerald-50 ring-1 ring-inset ring-emerald-200/35",
  },
  {
    dot: "bg-rose-400",
    cardBorder: "border-l-rose-400/65",
    railGlow: "",
    docPara: "border-l-[3px] border-l-rose-400/80 bg-rose-50/90",
    docCell: "bg-rose-50 ring-1 ring-inset ring-rose-200/35",
  },
  {
    dot: "bg-cyan-400",
    cardBorder: "border-l-cyan-400/65",
    railGlow: "",
    docPara: "border-l-[3px] border-l-cyan-400/80 bg-cyan-50/90",
    docCell: "bg-cyan-50 ring-1 ring-inset ring-cyan-200/35",
  },
] as const;

const docParaBase =
  "group relative whitespace-pre-line rounded-2xl border border-zinc-200/80 border-l-[3px] border-l-white/0 bg-white px-4 py-3.5 text-[15px] leading-[1.65] tracking-[-0.012em] text-zinc-800/95 shadow-sm transition-colors duration-150";

const docParaHover =
  "hover:border-zinc-300/90 hover:bg-white hover:shadow-md";

const docParaActive =
  "ring-2 ring-[var(--color-accent)]/45 shadow-sm";

const docParaRef = "border-l-[#d97757]/80 bg-orange-50 ring-1 ring-inset ring-[#d97757]/15";

const docParaDisabled = "cursor-not-allowed opacity-45";

const tdBase =
  "relative whitespace-pre-line rounded-xl border border-transparent px-3 py-2.5 text-[13px] leading-relaxed text-zinc-800/95 transition-colors duration-150";

const tdHover =
  "cursor-pointer hover:border-zinc-200/80 hover:bg-white/90 hover:shadow-sm";

const tdActive =
  "bg-white ring-2 ring-[var(--color-accent)]/40 shadow-sm";

const tdDisabled = "cursor-not-allowed opacity-40";

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
// XML parsing helpers (text extraction in lib/utils/docxParseText.ts)
// ---------------------------------------------------------------------------

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
          cells.push({ rowIndex: rowIdx, cellIndex: cellIdx, text: extractCellText(cellElem) });
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
      <span className="docx-viewer__loc-badge docx-viewer__loc-badge--para">
        p.{loc.paragraph_index}
      </span>
    ) : (
      <span className="docx-viewer__loc-badge docx-viewer__loc-badge--table">
        {tableLabels[loc.table_index] ?? `tbl.${loc.table_index}`} r{loc.row_index}c{loc.cell_index}
      </span>
    );
  const snippet = loc.text_content.length > 80 ? loc.text_content.slice(0, 80) + "…" : loc.text_content;

  return (
    <div className="docx-viewer__ref-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            #{index + 1}
          </span>
          {badge}
        </div>
        <button
          type="button"
          onClick={() => onRemove(reference.id)}
          className="docx-viewer__remove"
          aria-label="Remove reference"
        >
          ×
        </button>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-text-muted)]">{snippet || "(empty)"}</p>
      <button
        type="button"
        className="mt-2 text-[10px] font-medium text-[var(--color-accent)]/90 transition-opacity hover:opacity-100"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Hide locator" : "Show locator"}
      </button>
      {expanded && (
        <pre className="mt-2 max-h-28 overflow-auto rounded-xl border border-[var(--editor-chrome-border)] bg-[var(--color-surface-muted)] p-3 font-mono text-[10px] leading-relaxed text-[var(--color-text-muted)] editor-scrollbar">
          {JSON.stringify(loc, null, 2)}
        </pre>
      )}
      <textarea
        className="editor-instruction-input mt-3 px-3 py-2.5"
        rows={2}
        placeholder="Add a note…"
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
  colorIndex,
  onInstructionChange,
  onRemove,
}: {
  entry: FieldEditEntry;
  index: number;
  colorIndex: number;
  onInstructionChange: (id: string, instruction: string) => void;
  onRemove: (id: string) => void;
}) {
  const snippet = entry.locator.text_content.length > 60
    ? entry.locator.text_content.slice(0, 60) + "…"
    : entry.locator.text_content;
  const color = EDIT_COLORS[colorIndex];

  return (
    <div className={["docx-viewer__edit-card", color.railGlow].filter(Boolean).join(" ")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${color.dot}`} />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Edit {index + 1}
          </span>
          {entry.confidence === "mapped" ? (
            <span className="docx-viewer__chip-mapped">mapped</span>
          ) : (
            <span className="docx-viewer__chip-verify">verify path</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemove(entry.id)}
          className="docx-viewer__remove"
          aria-label="Remove edit"
        >
          ×
        </button>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-text-muted)]">{snippet || "(empty)"}</p>

      <div className="mt-3 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Field</p>
        <p className="text-[13px] font-medium text-[var(--color-text)]">{entry.label}</p>
        <code className="block break-all text-[10px] leading-snug text-[var(--color-accent)]/90">{entry.dotPath}</code>
      </div>

      <div className="mt-3">
        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Instruction
        </label>
        <textarea
          className="editor-instruction-input px-3 py-2.5"
          rows={3}
          placeholder="e.g. Shorten and use active voice…"
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
  initialEdits?: FieldEditItem[];
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
    initialEdits = [],
    onSubmitEdits,
    submitEditsDisabled = true,
    submitEditsBusy = false,
  } = props;
  const mode = props.mode ?? "reference";

  const docxUrl = "docxUrl" in props && props.docxUrl ? props.docxUrl : undefined;
  const docxBuffer = "docxBuffer" in props && props.docxBuffer !== undefined ? props.docxBuffer : undefined;

  const [blocks, setBlocks] = useState<ParsedBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reference mode state
  const [references, setReferences] = useState<Reference[]>([]);
  const [copiedAll, setCopiedAll] = useState(false);

  // Field editor mode state
  const [fieldEdits, setFieldEdits] = useState<FieldEditEntry[]>(() =>
    initialEdits.map((e) => ({
      id: crypto.randomUUID(),
      locator: {
        location: "paragraph",
        paragraph_index: -1,
        text_content: e.field_path,
      },
      dotPath: e.field_path,
      confidence: "mapped",
      label: e.field_path,
      instruction: e.instruction,
    })),
  );
  const [tooltipState, setTooltipState] = useState<TooltipState | null>(null);

  const tableLabels = targetFormat === "giz" ? GIZ_TABLE_LABELS : WB_TABLE_LABELS;

  /** Maps paragraph clicks to key_qualifications / other_relevant_info / paths. */
  const locatorDotPathOptions = useMemo((): LocatorToDotPathOptions => {
    const kq = effectiveKeyQualifications(cvData);
    const ori = effectiveOtherRelevantInfo(cvData);
    const opts: LocatorToDotPathOptions = {};
    if (kq.length > 0) opts.keyQualifications = kq;
    if (ori) opts.otherRelevantInfo = ori;
    if (cvData) opts.cvData = cvData;
    if (blocks.length > 0) {
      opts.docBlocks = blocks.map((b) =>
        b.kind === "paragraph"
          ? { kind: "paragraph" as const, paragraphIndex: b.paragraphIndex, text: b.text }
          : { kind: "table" as const, tableIndex: b.tableIndex },
      );
    }
    return opts;
  }, [cvData, targetFormat, blocks]);

  const referencedKeys = new Set([
    ...references.map((r) => locKey(r.locator)),
    ...fieldEdits.map((e) => locKey(e.locator)),
  ]);

  const activeKey = tooltipState ? locKey(tooltipState.locator) : null;

  // Maps each edited cell's key to its color index (0-4) so all edits originating
  // from the same cell share a color (even if multiple sub-fields are edited).
  const editColorMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of fieldEdits) {
      const k = locKey(e.locator);
      if (!map.has(k)) map.set(k, map.size);
    }
    return map;
  }, [fieldEdits]);

  // Load document — re-run when the signed URL or buffer changes (e.g. new render after field-edit).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        let ab: ArrayBuffer;
        if (docxBuffer !== undefined) {
          ab = docxBuffer;
        } else if (docxUrl !== undefined) {
          const res = await fetch(docxUrl, { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          ab = await res.arrayBuffer();
        } else {
          throw new Error("DocxViewer: missing docxUrl and docxBuffer");
        }
        const parsed = await loadBlocksFromBuffer(ab);
        if (!cancelled) { setBlocks(parsed); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [docxUrl, docxBuffer]);

  // Notify parent when edits change.
  const notifyEditsChange = useCallback((edits: FieldEditEntry[]) => {
    if (props.mode === "field_editor") {
      props.onEditsChange(
        edits.map((e) => {
          const t = e.locator.text_content?.trim();
          return {
            field_path: e.dotPath,
            instruction: e.instruction,
            ...(t ? { anchor_text: t } : {}),
          };
        }),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props]);

  // ---------------------------------------------------------------------------
  // Cell/paragraph click handler
  // ---------------------------------------------------------------------------

  const handleLocatorClick = useCallback(
    (locator: Locator, mouseEvent: React.MouseEvent) => {
      if (mode !== "field_editor") {
        setReferences((prev) => [...prev, { id: crypto.randomUUID(), locator, comment: "" }]);
        return;
      }

      const k = locKey(locator);
      const existingForThisCell = fieldEdits.filter((e) => locKey(e.locator) === k);
      const isReEditingThisCell = existingForThisCell.length > 0;
      // If at max, still allow re-editing an already-added cell (no net new edits).
      if (fieldEdits.length >= 5 && !isReEditingThisCell) return;

      const result = locatorToDotPath(locator as UtilLocator, targetFormat, locatorDotPathOptions);

      let tooltipOptions: CompositeCellOption[];
      let cellLabel = result.label;

      if (result.kind === "tasks_assigned") {
        const resolvedPath = resolveTasksAssignedPath(
          cvData?.generated_fields,
          result.projectIndex,
        );
        if (!resolvedPath) return;
        tooltipOptions = [{ label: "Assigned Tasks (detailed_tasks)", dotPath: resolvedPath }];
      } else if (result.kind === "composite") {
        tooltipOptions = result.options;
      } else {
        tooltipOptions = [{ label: result.label, dotPath: result.dotPath }];
      }

      if (tooltipOptions.length === 0) return;

      const initialInstructionsByPath =
        tooltipOptions.length > 1
          ? Object.fromEntries(
              existingForThisCell.map((e) => [e.dotPath, e.instruction] as const),
            )
          : undefined;

      setTooltipState({
        anchorX: mouseEvent.clientX,
        anchorY: mouseEvent.clientY,
        cellLabel,
        options: tooltipOptions,
        locator,
        initialInstructionsByPath,
      });
    },
    [mode, fieldEdits, targetFormat, cvData, locatorDotPathOptions],
  );

  // ---------------------------------------------------------------------------
  // Tooltip add / cancel handlers
  // ---------------------------------------------------------------------------

  const handleTooltipAdd = useCallback(
    (entry: { dotPath: string; instruction: string; locatorLabel: string }) => {
      if (!tooltipState) return;
      const { locator } = tooltipState;
      setTooltipState(null);

      setFieldEdits((prev) => {
        const k = locKey(locator);
        const existingSameField = prev.find((e) => locKey(e.locator) === k && e.dotPath === entry.dotPath);

        const next: FieldEditEntry[] = existingSameField
          ? prev.map((e) =>
              e.id === existingSameField.id
                ? { ...e, label: entry.locatorLabel, instruction: entry.instruction }
                : e,
            )
          : [
              ...prev,
              {
                id: crypto.randomUUID(),
                locator,
                dotPath: entry.dotPath,
                confidence: "mapped",
                label: entry.locatorLabel,
                instruction: entry.instruction,
              },
            ];
        notifyEditsChange(next);
        return next;
      });
    },
    [tooltipState, notifyEditsChange],
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
      locatorDotPathOptions,
    );
    return result.kind === "composite" || result.kind === "tasks_assigned";
  }

  const rightPanelTitle = mode === "field_editor"
    ? `Edits (${fieldEdits.length}/5)`
    : `References (${references.length})`;

  const rightPanelEmpty = mode === "field_editor"
    ? "Click any paragraph or cell to add an edit (max 5)."
    : "Click any paragraph or cell to capture a reference.";

  const showActionDock =
    mode === "field_editor" || (mode === "reference" && references.length > 0);

  return (
    <>
      <div className="editor-motion-safe flex h-full min-h-0 w-full flex-col overflow-hidden bg-transparent">
        <header className="docx-viewer__header">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="docx-viewer__title">
                {mode === "field_editor" ? "Field workspace" : "Reference workspace"}
              </h1>
              <span className="docx-viewer__badge">
                {mode === "field_editor" ? "Live edit" : "Live capture"}
              </span>
            </div>
            <p className="docx-viewer__lead">
              {mode === "field_editor"
                ? "Build a batch of up to five edits on the canvas, then apply when you are ready."
                : "Click the canvas to record locators and notes for export."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close workspace"
            className="docx-viewer__close active:scale-[0.96]"
          >
            <span className="text-[20px] leading-none">×</span>
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          {/* Canvas — grows with panel; keeps majority width beside inspector */}
          <div
            className="editor-scrollbar relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 contain-layout md:px-5 md:py-7 lg:px-7 lg:py-8"
            style={{ background: "var(--editor-desk-bg)" }}
          >
            {loading && (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3">
                <span className="relative flex h-9 w-9">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)]/25" />
                  <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--editor-chrome-border)] bg-[var(--color-surface-raised)]">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
                  </span>
                </span>
                <p className="text-[12px] font-medium text-[var(--color-text-muted)]">Preparing canvas…</p>
              </div>
            )}
            {error && (
              <div className="docx-viewer__error">
                <strong className="font-semibold">Could not load document</strong>
                <p className="mt-2 opacity-90">{error}</p>
              </div>
            )}
            {!loading && !error && (
              <div className="docx-viewer__paper space-y-3 md:space-y-3.5">
                {blocks.map((block) => {
                  if (block.kind === "paragraph") {
                    if (!block.text.trim()) return null;
                    const key = `p-${block.paragraphIndex}`;
                    const isReferenced = referencedKeys.has(key);
                    const isActive = key === activeKey;
                    const editColorIndex = editColorMap.get(key);
                    const editColor = editColorIndex !== undefined ? EDIT_COLORS[editColorIndex] : null;
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
                          docParaBase,
                          docParaHover,
                          atMax && !isReferenced && !isActive ? docParaDisabled : "cursor-pointer",
                          isActive
                            ? `${docParaActive} bg-white`
                            : editColor
                            ? editColor.docPara
                            : isReferenced
                            ? docParaRef
                            : "",
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
                    <div
                      key={`t-${block.tableIndex}`}
                      className="docx-viewer__table-wrap"
                    >
                      <div className="overflow-x-auto rounded-[1.1rem] editor-scrollbar">
                        <table className="w-full min-w-[280px] border-separate border-spacing-1.5 text-[13px] text-zinc-800/95">
                          <tbody>
                          {block.rows.map((row) => (
                            <tr key={row.rowIndex}>
                              {row.cells.map((cell) => {
                                const key = `t-${block.tableIndex}-${row.rowIndex}-${cell.cellIndex}`;
                                const isReferenced = referencedKeys.has(key);
                                const isActive = key === activeKey;
                                const editColorIndex = editColorMap.get(key);
                                const editColor = editColorIndex !== undefined ? EDIT_COLORS[editColorIndex] : null;
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
                                      tdBase,
                                      atMax && !isReferenced && !isActive ? tdDisabled : tdHover,
                                      isActive
                                        ? tdActive
                                        : editColor
                                        ? editColor.docCell
                                        : isReferenced
                                        ? "bg-orange-50/90 ring-1 ring-inset ring-[#d97757]/25"
                                        : "bg-white/50",
                                    ].join(" ")}
                                    title={
                                      `${tableLabels[block.tableIndex] ?? `Table ${block.tableIndex}`} · r${row.rowIndex}c${cell.cellIndex}` +
                                      (composite ? " — click to choose field" : "")
                                    }
                                  >
                                    {cell.text || (
                                      <span className="docx-viewer__empty-cell">empty</span>
                                    )}
                                    {composite && mode === "field_editor" && (
                                      <span
                                        className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)]/20 text-[10px] font-semibold text-[var(--color-accent)]"
                                        aria-hidden="true"
                                      >
                                        ⌄
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Inspector */}
          <aside className="docx-viewer__rail">
            <div className="shrink-0 space-y-1 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                {rightPanelTitle}
              </p>
              <p className="text-[12px] leading-relaxed text-[var(--color-text-muted)]">{rightPanelEmpty}</p>
            </div>

            <div className="editor-scrollbar flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-1 md:px-5">
              {mode === "field_editor" ? (
                fieldEdits.length === 0 ? (
                  <div className="docx-viewer__empty">
                    <p className="text-[12px] font-medium text-[var(--color-text-muted)]">No edits queued</p>
                    <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                      Click the canvas to capture a field and add an instruction.
                    </p>
                  </div>
                ) : (
                  fieldEdits.map((entry, i) => (
                    <FieldEditEntryItem
                      key={entry.id}
                      entry={entry}
                      index={i}
                      colorIndex={editColorMap.get(locKey(entry.locator)) ?? i}
                      onInstructionChange={updateInstruction}
                      onRemove={removeFieldEdit}
                    />
                  ))
                )
              ) : references.length === 0 ? (
                <div className="docx-viewer__empty">
                  <p className="text-[12px] font-medium text-[var(--color-text-muted)]">No references yet</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                    Select paragraphs or cells on the canvas to list them here.
                  </p>
                </div>
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
              )}
            </div>
          </aside>
        </div>

        {showActionDock && (
          <footer className="docx-viewer__footer">
            {mode === "field_editor" && onSubmitEdits ? (
              <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="docx-viewer__footer-hint">
                  {fieldEdits.length === 0
                    ? "Queue edits on the canvas, then apply to run the field editor."
                    : `${fieldEdits.length} edit${fieldEdits.length === 1 ? "" : "s"} ready — verify instructions before applying.`}
                </p>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setFieldEdits([]);
                      notifyEditsChange([]);
                    }}
                    className="docx-viewer__btn-secondary active:scale-[0.98]"
                    disabled={fieldEdits.length === 0}
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    disabled={submitEditsDisabled}
                    onClick={onSubmitEdits}
                    className="docx-viewer__btn-primary active:scale-[0.98]"
                  >
                    {submitEditsBusy
                      ? "Applying…"
                      : fieldEdits.length === 0
                      ? "Apply refinements"
                      : `Apply ${fieldEdits.length} refinement${fieldEdits.length === 1 ? "" : "s"}`}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="docx-viewer__footer-hint">
                  {references.length} reference{references.length === 1 ? "" : "s"} captured
                </p>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setReferences([])}
                    className="docx-viewer__btn-secondary active:scale-[0.98]"
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyAllJson()}
                    className="docx-viewer__btn-primary active:scale-[0.98]"
                  >
                    {copiedAll ? "Copied" : "Copy JSON"}
                  </button>
                </div>
              </div>
            )}
          </footer>
        )}
      </div>

      {/* Tooltip — rendered as portal outside the viewer */}
      {tooltipState && mode === "field_editor" && (
        <FieldSelectorTooltip
          anchorX={tooltipState.anchorX}
          anchorY={tooltipState.anchorY}
          cellLabel={tooltipState.cellLabel}
          options={tooltipState.options}
          batchSize={fieldEdits.length}
          initialInstructionsByPath={tooltipState.initialInstructionsByPath}
          onAdd={handleTooltipAdd}
          onCancel={handleTooltipCancel}
        />
      )}
    </>
  );
}
