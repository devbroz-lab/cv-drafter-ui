import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  approveCheckpoint,
  formatApiError,
  getManifest,
  getOutput,
  getOutputDownloadUrl,
  getSessionStatus,
  submitFieldEdits,
} from "../lib/api";
import { upsertRecentSession } from "../lib/recentSessions";
import type {
  FieldEditItem,
  FieldEditResponse,
  HighSeverityIssue,
  LowSeverityIssue,
  OutputResponse,
  SessionStatus,
} from "../lib/types";

import { DocxViewer } from "../components/DocxViewer";
import { TorPoolPicker } from "../components/TorPoolPicker";
import { Button, Card } from "../components/ui";

// ---------------------------------------------------------------------------
// Polling helper
// ---------------------------------------------------------------------------

function pollMs(status: SessionStatus | undefined): number | false {
  if (!status) return 2500;
  if (status === "completed" || status === "failed") return false;
  return 2500;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function SessionWorkspacePage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Remote data ────────────────────────────────────────────────────────────

  const statusQuery = useQuery({
    queryKey: ["sessionStatus", sessionId, accessToken],
    queryFn: () => getSessionStatus(accessToken!, sessionId),
    enabled: !!accessToken && !!sessionId,
    refetchInterval: (q) => pollMs(q.state.data?.status),
  });

  const st = statusQuery.data?.status;

  const manifestQuery = useQuery({
    queryKey: ["manifest", sessionId, accessToken],
    queryFn: () => getManifest(accessToken!, sessionId),
    enabled: !!accessToken && !!sessionId && st !== undefined && st !== "queued",
    retry: false,
    refetchInterval: () => pollMs(st),
  });

  // Fetch output whenever we're at a stage that has generated content.
  const outputQuery = useQuery({
    queryKey: ["output", sessionId, accessToken],
    queryFn: () => getOutput(accessToken!, sessionId),
    enabled:
      !!accessToken &&
      !!sessionId &&
      (st === "checkpoint_3_pending" || st === "completed"),
  });

  // ── Recent session tracking ────────────────────────────────────────────────

  useEffect(() => {
    if (statusQuery.data) {
      const d = statusQuery.data;
      upsertRecentSession({
        id: d.session_id,
        label: d.source_filename || d.session_id,
        targetFormat: d.target_format,
        updatedAt: new Date().toISOString(),
      });
    }
  }, [statusQuery.data]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const approveMut = useMutation({
    mutationFn: (checkpoint: "checkpoint_1" | "checkpoint_2" | "checkpoint_3") =>
      approveCheckpoint(accessToken!, sessionId, checkpoint, "Approved from web UI"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sessionStatus", sessionId] });
      void qc.invalidateQueries({ queryKey: ["manifest", sessionId] });
      toast("Checkpoint approved.");
    },
    onError: (e) => toast(formatApiError(e), "error"),
  });

  // ── Checkpoint acknowledgement checkboxes ─────────────────────────────────

  const [c2Ack, setC2Ack] = useState(false);
  const [c3Ack, setC3Ack] = useState(false);

  // ── Download ───────────────────────────────────────────────────────────────

  const [downloading, setDownloading] = useState(false);

  const runDownload = useCallback(async () => {
    if (!accessToken) return;
    setDownloading(true);
    try {
      const { signed_url } = await getOutputDownloadUrl(accessToken, sessionId);
      window.open(signed_url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast(formatApiError(e), "error");
    } finally {
      setDownloading(false);
    }
  }, [accessToken, sessionId, toast]);

  // ── DocxViewer state ───────────────────────────────────────────────────────

  const [showViewer, setShowViewer] = useState(false);
  const [viewerDocxUrl, setViewerDocxUrl] = useState<string | null>(null);
  const [viewerMode, setViewerMode] = useState<"reference" | "field_editor">("reference");
  const [viewerLoading, setViewerLoading] = useState(false);

  // Track round so we can refresh the signed URL when a new round completes.
  const prevRoundRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const currentRound = statusQuery.data?.round;
    if (
      prevRoundRef.current !== undefined &&
      currentRound !== undefined &&
      currentRound !== prevRoundRef.current &&
      showViewer &&
      accessToken
    ) {
      // Round changed while viewer is open → refresh the signed URL.
      getOutputDownloadUrl(accessToken, sessionId)
        .then(({ signed_url }) => setViewerDocxUrl(signed_url))
        .catch(() => {/* non-fatal */});
    }
    prevRoundRef.current = currentRound;
  }, [statusQuery.data?.round, showViewer, accessToken, sessionId]);

  const openViewer = useCallback(async (mode: "reference" | "field_editor") => {
    if (!accessToken) return;
    setViewerLoading(true);
    try {
      const { signed_url } = await getOutputDownloadUrl(accessToken, sessionId);
      setViewerDocxUrl(signed_url);
      setViewerMode(mode);
      setShowViewer(true);
    } catch (e) {
      toast(formatApiError(e), "error");
    } finally {
      setViewerLoading(false);
    }
  }, [accessToken, sessionId, toast]);

  // ── Field editor / batch state ─────────────────────────────────────────────

  const [pendingEdits, setPendingEdits] = useState<FieldEditItem[]>([]);
  // Stores the result of the last POST /field-edit call when skipped > 0,
  // so we can show the skipped-edits decision UI.
  const [lastEditResult, setLastEditResult] = useState<FieldEditResponse | null>(null);

  const fieldEditMut = useMutation({
    mutationFn: (edits: FieldEditItem[]) => submitFieldEdits(accessToken!, sessionId, edits),
    onSuccess: (data: FieldEditResponse) => {
      void qc.invalidateQueries({ queryKey: ["sessionStatus", sessionId] });
      void qc.invalidateQueries({ queryKey: ["manifest", sessionId] });
      void qc.invalidateQueries({ queryKey: ["output", sessionId] });
      setPendingEdits([]);

      if (data.skipped.length === 0) {
        // All edits applied — close viewer, let checkpoint_3 UI take over.
        setShowViewer(false);
        setViewerDocxUrl(null);
        setLastEditResult(null);
        toast(`${data.applied.length} edit${data.applied.length !== 1 ? "s" : ""} applied.`);
      } else {
        // Some edits were skipped — keep viewer open, surface decision UI.
        setLastEditResult(data);
        toast(`${data.applied.length} applied, ${data.skipped.length} skipped — see details below.`, "error");
      }
    },
    onError: (e) => toast(formatApiError(e), "error"),
  });

  // "Approve anyway" after partial skips — proceed to checkpoint_3 approval.
  const handleApproveAnyway = useCallback(() => {
    setLastEditResult(null);
    setShowViewer(false);
    setViewerDocxUrl(null);
    void qc.invalidateQueries({ queryKey: ["sessionStatus", sessionId] });
    toast("Proceeding to approval with applied edits.");
  }, [qc, sessionId, toast]);

  // "Cancel & re-edit" — close viewer, clear result, stay at checkpoint_3_pending.
  // User can submit another POST /field-edit batch (backend now accepts
  // both "completed" and "checkpoint_3_pending").
  const handleCancelReEdit = useCallback(() => {
    setLastEditResult(null);
    // Re-open the viewer so the user can submit a corrected batch.
    void openViewer("field_editor");
    toast(
      `${lastEditResult?.applied.length ?? 0} edits were already applied. Re-editing for the ${lastEditResult?.skipped.length ?? 0} skipped field(s).`,
    );
  }, [lastEditResult, openViewer, toast]);

  // ── Misc ───────────────────────────────────────────────────────────────────

  const headline = useMemo(() => {
    if (!statusQuery.data) return "Loading session…";
    return `Session · ${statusQuery.data.source_filename}`;
  }, [statusQuery.data]);

  if (!sessionId)
    return (
      <p className="text-[var(--color-text-muted)]">
        Invalid route.{" "}
        <Link className="text-[var(--color-accent)] underline" to="/">
          Back home
        </Link>
      </p>
    );

  const pageStyle = showViewer ? { paddingRight: "55vw" } : undefined;

  // ── Render ─────────────────────────────────────────────────────────────────

  const sessionContent = (
    <div className="space-y-6" style={pageStyle}>
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-xs text-[var(--color-accent)] hover:underline" to="/">
            ← Home
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-[var(--color-text)]">{headline}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]">
            <span>ID: {sessionId}</span>
            <span>·</span>
            <span>Status: {statusQuery.data?.status ?? "…"}</span>
            <span>·</span>
            <span>Format: {statusQuery.data?.target_format ?? "…"}</span>
            <span>·</span>
            <span>Round: {statusQuery.data?.round ?? "…"}</span>
          </div>
        </div>
      </div>

      {/* Pipeline steps */}
      {manifestQuery.data && (
        <Card>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Pipeline steps</h2>
          <ul className="mt-3 max-h-[320px] space-y-1.5 overflow-y-auto text-xs">
            {manifestQuery.data.steps.map((step) => (
              <li
                key={step.name}
                className="flex justify-between rounded-lg bg-[var(--color-bg)] px-2 py-1.5"
              >
                <span className="text-[var(--color-text)]">{step.name}</span>
                <span className="text-[var(--color-text-muted)]">{step.status}</span>
              </li>
            ))}
          </ul>
          {manifestQuery.data.checkpoint_pending && (
            <p className="mt-3 text-xs text-[var(--color-accent)]">
              Waiting on: <strong>{manifestQuery.data.checkpoint_pending}</strong>
            </p>
          )}
        </Card>
      )}
      {st && st !== "queued" && manifestQuery.isError && (
        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">
            Manifest not available yet — pipeline starting.
          </p>
        </Card>
      )}

      {/* Checkpoint 1 — includes ToR pool selection */}
      {st === "checkpoint_1_pending" && (
        <Card>
          <h2 className="text-lg font-medium text-[var(--color-text)]">
            Checkpoint 1 — Extraction complete
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Agents extracted the CV and summarised the Terms of Reference. Select the expert
            role this candidate is being submitted for, then approve to continue.
          </p>
          <TorPoolPicker
            sessionId={sessionId}
            busy={approveMut.isPending}
            onSuccess={() => {
              void qc.invalidateQueries({ queryKey: ["sessionStatus", sessionId] });
              void qc.invalidateQueries({ queryKey: ["manifest", sessionId] });
              toast("Checkpoint 1 approved.");
            }}
            onError={(msg) => toast(msg, "error")}
          />
        </Card>
      )}

      {/* Checkpoint 2 */}
      {st === "checkpoint_2_pending" && (
        <CheckpointCard
          title="Checkpoint 2 — Mapping complete"
          description="Review the mapping outcome in the manifest, then approve to run field generation, review, and compression."
          acknowledged={c2Ack}
          onAckChange={setC2Ack}
          onApprove={() => approveMut.mutate("checkpoint_2")}
          busy={approveMut.isPending}
        />
      )}

      {/* Checkpoint 3 — ready to render (from both pipeline and post-edit paths) */}
      {st === "checkpoint_3_pending" && (
        <Card>
          <h2 className="text-lg font-medium text-[var(--color-text)]">
            Checkpoint 3 — Ready to render
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Generated content and compression are finalised. Approve to build the Word output.
          </p>

          {/* Skipped edits decision card (only shown after a field-edit submission) */}
          {lastEditResult && lastEditResult.skipped.length > 0 && (
            <SkippedEditsCard
              result={lastEditResult}
              onApproveAnyway={handleApproveAnyway}
              onCancelReEdit={handleCancelReEdit}
            />
          )}

          {outputQuery.data && <OutputSummary data={outputQuery.data} />}

          <label className="mt-6 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={c3Ack}
              onChange={(e) => setC3Ack(e.target.checked)}
            />
            I have reviewed this output and approve rendering.
          </label>
          <Button
            className="mt-4"
            type="button"
            disabled={!c3Ack || approveMut.isPending}
            onClick={() => approveMut.mutate("checkpoint_3")}
          >
            {approveMut.isPending ? "Approving…" : "Approve & render"}
          </Button>
        </Card>
      )}

      {/* Completed */}
      {st === "completed" && (
        <>
          {outputQuery.data && (
            <Card>
              <h2 className="text-lg font-medium text-[var(--color-text)]">Completed</h2>

              <OutputSummary data={outputQuery.data} />

              {/* Action buttons */}
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  type="button"
                  disabled={downloading}
                  onClick={() => void runDownload()}
                >
                  {downloading ? "Opening…" : "Download formatted Word"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={viewerLoading || (showViewer && viewerMode === "reference")}
                  onClick={() => void openViewer("reference")}
                >
                  {viewerLoading && viewerMode !== "field_editor"
                    ? "Loading…"
                    : showViewer && viewerMode === "reference"
                    ? "Viewer open →"
                    : "View Document"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={viewerLoading || (showViewer && viewerMode === "field_editor")}
                  onClick={() => void openViewer("field_editor")}
                >
                  {viewerLoading && viewerMode === "field_editor"
                    ? "Loading…"
                    : showViewer && viewerMode === "field_editor"
                    ? "Edit viewer open →"
                    : "Edit Document"}
                </Button>
              </div>

              {/* Pending edits batch (visible when viewer is open in field_editor mode) */}
              {showViewer && viewerMode === "field_editor" && (
                <div className="mt-6 space-y-3">
                  {pendingEdits.length > 0 && (
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs">
                      <p className="font-semibold text-[var(--color-text)]">
                        Queued edits ({pendingEdits.length}/5)
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {pendingEdits.map((e, i) => (
                          <li key={i} className="flex gap-2 text-[var(--color-text-muted)]">
                            <code className="shrink-0 text-[var(--color-accent)]">{e.field_path}</code>
                            <span className="truncate opacity-70">
                              {e.instruction || "(no instruction yet)"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      disabled={
                        pendingEdits.length === 0 ||
                        pendingEdits.some((e) => !e.instruction.trim()) ||
                        fieldEditMut.isPending
                      }
                      onClick={() => fieldEditMut.mutate(pendingEdits)}
                    >
                      {fieldEditMut.isPending
                        ? "Applying edits…"
                        : pendingEdits.length === 0
                        ? "Add edits in the viewer →"
                        : `Submit ${pendingEdits.length} edit${pendingEdits.length !== 1 ? "s" : ""}`}
                    </Button>
                  </div>

                  {pendingEdits.length > 0 && pendingEdits.some((e) => !e.instruction.trim()) && (
                    <p className="text-xs text-amber-300">
                      All edits need an instruction before submitting.
                    </p>
                  )}
                </div>
              )}
            </Card>
          )}
          {!outputQuery.data && outputQuery.isLoading && (
            <Card>
              <p className="text-sm text-[var(--color-text-muted)]">Loading output…</p>
            </Card>
          )}
        </>
      )}

      {/* Failed */}
      {st === "failed" && statusQuery.data?.error_message && (
        <Card>
          <h2 className="text-lg font-medium text-red-300">Failed</h2>
          <pre className="mt-4 whitespace-pre-wrap text-sm text-[var(--color-text-muted)]">
            {statusQuery.data.error_message}
          </pre>
        </Card>
      )}

      {/* Processing / queued */}
      {(st === "queued" || st === "processing") && (
        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">
            Pipeline is running. This page refreshes automatically. When a checkpoint is reached,
            approve it here.
          </p>
        </Card>
      )}
    </div>
  );

  return (
    <>
      {sessionContent}

      {/* DocxViewer — opens at completed in either reference or field_editor mode */}
      {showViewer && viewerDocxUrl && (
        <DocxViewer
          docxUrl={viewerDocxUrl}
          mode={viewerMode}
          targetFormat={statusQuery.data?.target_format ?? "giz"}
          cvData={outputQuery.data?.cv_data}
          onEditsChange={viewerMode === "field_editor" ? setPendingEdits : undefined as never}
          onClose={() => {
            setShowViewer(false);
            setViewerDocxUrl(null);
            setPendingEdits([]);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// CheckpointCard
// ---------------------------------------------------------------------------

function CheckpointCard(props: {
  title: string;
  description: string;
  acknowledged: boolean;
  onAckChange: (v: boolean) => void;
  onApprove: () => void;
  busy: boolean;
}) {
  return (
    <Card>
      <h2 className="text-lg font-medium text-[var(--color-text)]">{props.title}</h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{props.description}</p>
      <label className="mt-6 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
        <input
          type="checkbox"
          checked={props.acknowledged}
          onChange={(e) => props.onAckChange(e.target.checked)}
        />
        I have reviewed the results and approve continuing.
      </label>
      <Button
        className="mt-4"
        type="button"
        disabled={!props.acknowledged || props.busy}
        onClick={props.onApprove}
      >
        {props.busy ? "Working…" : "Approve checkpoint"}
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SkippedEditsCard — shown at checkpoint_3_pending when some edits were skipped
// ---------------------------------------------------------------------------

function SkippedEditsCard({
  result,
  onApproveAnyway,
  onCancelReEdit,
}: {
  result: FieldEditResponse;
  onApproveAnyway: () => void;
  onCancelReEdit: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-amber-300">
          {result.applied.length} edit{result.applied.length !== 1 ? "s" : ""} applied
        </span>
        <span className="text-[var(--color-text-muted)]">·</span>
        <span className="font-semibold text-red-300">
          {result.skipped.length} skipped
        </span>
      </div>

      {result.applied.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
            Applied
          </p>
          <ul className="mt-1 space-y-0.5">
            {result.applied.map((p) => (
              <li key={p}>
                <code className="text-xs text-emerald-300">{p}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400">
          Skipped — the agent could not apply these
        </p>
        <ul className="mt-1 space-y-0.5">
          {result.skipped.map((p) => (
            <li key={p}>
              <code className="text-xs text-red-300">{p}</code>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">
        Applied edits are already written and will appear in the re-rendered output. Skipped edits
        are absent. Choose how to proceed:
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={onApproveAnyway}>
          Approve anyway
        </Button>
        <Button type="button" variant="secondary" onClick={onCancelReEdit}>
          Cancel &amp; re-edit skipped fields
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReviewInfoCard — AI review summary with solvability badges
// ---------------------------------------------------------------------------

function SolvabilityBadge({ solvability }: { solvability?: string }) {
  if (!solvability) return null;
  if (solvability === "pipeline")
    return (
      <span className="rounded bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
        pipeline-fixable
      </span>
    );
  return (
    <span className="rounded bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
      needs human review
    </span>
  );
}

function ReviewInfoCard({ data }: { data: OutputResponse }) {
  const review = data.review;
  if (!review) return null;

  const highs: HighSeverityIssue[] = review.high_severity ?? [];
  const lows: LowSeverityIssue[] = review.low_severity ?? [];

  if (highs.length === 0 && lows.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs font-semibold text-[var(--color-text)]">AI Review Summary</p>
        {review.passed ? (
          <span className="rounded bg-emerald-950/60 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            All checks passed
          </span>
        ) : (
          <span className="rounded bg-amber-950/60 px-2 py-0.5 text-[10px] font-medium text-amber-300">
            {highs.length} flag{highs.length !== 1 ? "s" : ""} — for your awareness
          </span>
        )}
        {lows.length > 0 && (
          <span className="rounded bg-[var(--color-surface)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
            {lows.length} style fix{lows.length !== 1 ? "es" : ""} auto-applied
          </span>
        )}
      </div>

      {/* High severity */}
      {highs.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400">
            High-severity flags ({highs.length}) — review recommended
          </p>
          {highs.map((h, i) => (
            <div
              key={i}
              className="rounded-lg border border-red-900/30 bg-[var(--color-surface)] p-3 text-xs space-y-1"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-red-300">Flag {i + 1}</span>
                {(h.field ?? h.path) && (
                  <code className="rounded bg-[var(--color-border)]/30 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-accent)]">
                    {h.field ?? h.path}
                  </code>
                )}
                <SolvabilityBadge solvability={h.solvability} />
                {h.solvability === "pipeline" && (
                  <span className="text-[10px] text-emerald-400/70">
                    — use Edit Document to fix
                  </span>
                )}
              </div>
              <p className="text-[var(--color-text)]">{h.issue ?? "—"}</p>
              {h.recommendation && (
                <p className="text-[var(--color-text-muted)]">
                  <span className="font-medium text-[var(--color-text)]">Suggestion: </span>
                  {h.recommendation}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Low severity */}
      {lows.length > 0 && (
        <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs">
          <summary className="cursor-pointer font-medium text-[var(--color-text)]">
            Style fixes applied automatically — {lows.length} items
          </summary>
          <ul className="mt-3 space-y-3 text-[var(--color-text-muted)]">
            {lows.map((l, i) => (
              <li
                key={i}
                className="border-t border-[var(--color-border)] pt-3 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p>{l.issue ?? "—"}</p>
                  <SolvabilityBadge solvability={l.solvability} />
                </div>
                {(l.fixed ?? l.original) && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-[var(--color-text)]">
                      Before / after
                    </summary>
                    <div className="mt-2 grid gap-2 text-xs">
                      {l.original !== undefined && (
                        <div>
                          <span className="text-[var(--color-text)]">Original: </span>
                          <span className="whitespace-pre-wrap">{String(l.original)}</span>
                        </div>
                      )}
                      {l.fixed !== undefined && (
                        <div>
                          <span className="text-[var(--color-text)]">Fixed: </span>
                          <span className="whitespace-pre-wrap">{String(l.fixed)}</span>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OutputSummary
// ---------------------------------------------------------------------------

function OutputSummary({ data }: { data: OutputResponse }) {
  return (
    <div className="mt-6 space-y-4 text-sm">
      {data.compression && (
        <div className="rounded-xl bg-[var(--color-bg)] p-3 text-[var(--color-text-muted)]">
          <p className="text-xs font-semibold text-[var(--color-text)]">Compression</p>
          <pre className="mt-2 whitespace-pre-wrap text-xs">
            {JSON.stringify(data.compression, null, 2)}
          </pre>
        </div>
      )}
      {data.generation_warnings?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-300">Warnings</p>
          <ul className="mt-1 list-inside list-disc text-[var(--color-text-muted)]">
            {data.generation_warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* AI Review info card */}
      <ReviewInfoCard data={data} />

      <details className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
        <summary className="cursor-pointer text-xs font-medium text-[var(--color-text)]">
          Raw CV data (JSON)
        </summary>
        <pre className="mt-3 max-h-[400px] overflow-auto text-xs text-[var(--color-text-muted)]">
          {JSON.stringify(data.cv_data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
