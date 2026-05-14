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
  SkippedEditItem,
} from "../lib/types";

import { DocxViewer } from "../components/DocxViewer";
import { EditorSidePanel } from "../components/layout/EditorSidePanel";
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

function progressForStatus(status: SessionStatus | undefined): number {
  switch (status) {
    case "queued":
      return 8;
    case "processing":
      return 35;
    case "checkpoint_1_pending":
      return 52;
    case "checkpoint_2_pending":
      return 68;
    case "checkpoint_3_pending":
      return 84;
    case "completed":
      return 100;
    case "failed":
      return 100;
    default:
      return 12;
  }
}

/** Notes persisted with auto-approved checkpoints (2 & 3). */
const AUTO_CP_NOTES = "Auto-approved (checkpoints skipped in UI)";

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

  // ── Auto-approve checkpoints 2 & 3 (checkpoint 1 is manual ToR selection) ───

  useEffect(() => {
    if (!accessToken || !sessionId || st !== "checkpoint_2_pending") return;

    const ac = new AbortController();
    let lastErr = "";

    void (async () => {
      const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
      const maxAttempts = 30;

      for (let attempt = 0; attempt < maxAttempts && !ac.signal.aborted; attempt++) {
        try {
          await approveCheckpoint(accessToken, sessionId, "checkpoint_2", AUTO_CP_NOTES);
          if (ac.signal.aborted) return;
          void qc.invalidateQueries({ queryKey: ["sessionStatus", sessionId] });
          void qc.invalidateQueries({ queryKey: ["manifest", sessionId] });
          return;
        } catch (e) {
          lastErr = formatApiError(e);
          await wait(2000);
        }
      }
      if (!ac.signal.aborted && lastErr) {
        toast(
          `Could not auto-complete checkpoint 2 after several tries: ${lastErr}`,
          "error",
        );
      }
    })();

    return () => ac.abort();
  }, [accessToken, qc, sessionId, st, toast]);

  useEffect(() => {
    if (!accessToken || !sessionId || st !== "checkpoint_3_pending") return;

    const ac = new AbortController();
    let lastErr = "";

    void (async () => {
      const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
      const maxAttempts = 30;

      for (let attempt = 0; attempt < maxAttempts && !ac.signal.aborted; attempt++) {
        try {
          await approveCheckpoint(accessToken, sessionId, "checkpoint_3", AUTO_CP_NOTES);
          if (ac.signal.aborted) return;
          void qc.invalidateQueries({ queryKey: ["sessionStatus", sessionId] });
          void qc.invalidateQueries({ queryKey: ["manifest", sessionId] });
          void qc.invalidateQueries({ queryKey: ["output", sessionId] });
          return;
        } catch (e) {
          lastErr = formatApiError(e);
          await wait(2000);
        }
      }
      if (!ac.signal.aborted && lastErr) {
        toast(
          `Could not auto-complete checkpoint 3 after several tries: ${lastErr}`,
          "error",
        );
      }
    })();

    return () => ac.abort();
  }, [accessToken, qc, sessionId, st, toast]);

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

  const prevStatusForViewerRef = useRef<SessionStatus | undefined>(undefined);
  useEffect(() => {
    const prev = prevStatusForViewerRef.current;
    prevStatusForViewerRef.current = st;
    // After field-edit, round increments before the new .docx exists; output_storage_key updates
    // when Phase 4 finishes. Refresh the signed URL so an open viewer does not keep the old file.
    if (prev === "processing" && st === "completed" && showViewer && accessToken && sessionId) {
      void getOutputDownloadUrl(accessToken, sessionId)
        .then(({ signed_url }) => setViewerDocxUrl(signed_url))
        .catch(() => {/* non-fatal */});
    }
  }, [st, showViewer, accessToken, sessionId]);

  const closeEditorPanel = useCallback(() => {
    setShowViewer(false);
  }, []);

  const onEditorPanelExited = useCallback(() => {
    setViewerDocxUrl(null);
  }, []);

  const openViewer = useCallback(async (mode: "reference" | "field_editor") => {
    if (!accessToken) return;
    setViewerLoading(true);
    try {
      // Field editor needs cv_data (GET /output) so key_qualifications paths resolve.
      if (mode === "field_editor") {
        await qc.ensureQueryData({
          queryKey: ["output", sessionId, accessToken],
          queryFn: () => getOutput(accessToken, sessionId),
        });
      }
      const { signed_url } = await getOutputDownloadUrl(accessToken, sessionId);
      setViewerDocxUrl(signed_url);
      setViewerMode(mode);
      setShowViewer(true);
    } catch (e) {
      toast(formatApiError(e), "error");
    } finally {
      setViewerLoading(false);
    }
  }, [accessToken, qc, sessionId, toast]);

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

      const skipped = data.skipped ?? [];
      const applied = data.applied ?? [];

      if (skipped.length === 0) {
        setShowViewer(false);
        setLastEditResult(null);
        toast(
          `${applied.length} edit${applied.length !== 1 ? "s" : ""} saved. ` +
            "The Word file updates after rendering finishes (status returns to completed); open View or Download again then.",
        );
      } else {
        setLastEditResult(data);
        toast(`${applied.length} applied, ${skipped.length} skipped — see details below.`, "error");
      }
    },
    onError: (e) => {
      toast(formatApiError(e), "error");
      setShowViewer(false);
    },
  });

  // After partial skips: dismiss notice on completed (render already ran or will complete).
  const handleApproveAnyway = useCallback(() => {
    setLastEditResult(null);
    setShowViewer(false);
  }, []);

  // "Cancel & re-edit" — re-open field editor; submit another /field-edit batch.
  const handleCancelReEdit = useCallback(() => {
    const applied = lastEditResult?.applied.length ?? 0;
    const skippedCount = lastEditResult?.skipped.length ?? 0;
    setLastEditResult(null);
    void openViewer("field_editor");
    toast(
      `${applied} edits were already applied. Re-editing for the ${skippedCount} skipped field(s).`,
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

  // ── Render ─────────────────────────────────────────────────────────────────

  const sessionContent = (
    <div className="mx-auto w-full max-w-6xl space-y-6">
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

      {st !== "completed" && st !== "failed" && (
        <Card className="space-y-4 border-[var(--color-border)]/80 bg-[var(--color-bg)]/35">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="relative inline-flex h-5 w-5 items-center justify-center">
                <span className="absolute inline-flex h-5 w-5 animate-ping rounded-full bg-[var(--color-accent)]/30" />
                <span className="inline-flex h-2.5 w-2.5 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
              </span>
              <div>
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Pipeline progress</h2>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Processing in background. Status updates every few seconds.
              </p>
              </div>
            </div>
            <span className="text-xs font-medium text-[var(--color-accent)]">
              {progressForStatus(st)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-700 ease-out"
              style={{ width: `${progressForStatus(st)}%` }}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-xs">
            <span className="text-[var(--color-text-muted)]">
              Current stage:{" "}
              <span className="font-medium text-[var(--color-text)]">
                {(st ?? "starting").replace(/_/g, " ")}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[var(--color-accent)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)]" />
              Live
            </span>
          </div>
        </Card>
      )}

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
      {(st === "processing" || st?.startsWith("checkpoint_")) &&
        manifestQuery.isLoading &&
        !manifestQuery.data && (
          <Card>
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
              Loading detailed pipeline steps…
            </div>
          </Card>
        )}

      {/* Checkpoint 1: manual ToR / SN selection */}
      {st === "checkpoint_1_pending" && (
        <Card className="border-[var(--color-border)]/80 bg-[var(--color-bg)]/35">
          <h2 className="text-lg font-medium text-[var(--color-text)]">
            {statusQuery.data?.target_format === "world_bank"
              ? "Checkpoint 1 — Select Statement of Need (SN)"
              : "Checkpoint 1 — Select ToR role"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
            {statusQuery.data?.target_format === "world_bank" ? (
              <>
                Choose the SN from the ToR that matches this consultant. After you continue, later
                checkpoints run automatically.
              </>
            ) : (
              <>
                Choose the best-matching expert pool from the ToR. Once selected and approved, the
                pipeline continues automatically.
              </>
            )}
          </p>
          <TorPoolPicker
            sessionId={sessionId}
            targetFormat={statusQuery.data?.target_format ?? "giz"}
            onSuccess={() => {
              void qc.invalidateQueries({ queryKey: ["sessionStatus", sessionId] });
              void qc.invalidateQueries({ queryKey: ["manifest", sessionId] });
              toast("Checkpoint 1 approved.");
            }}
            onError={(msg) => toast(msg, "error")}
          />
        </Card>
      )}

      {/* Checkpoints 2–3: auto-approved — brief status only */}
      {(st === "checkpoint_2_pending" || st === "checkpoint_3_pending") && (
        <Card className="border-[var(--color-border)]/80 bg-[var(--color-bg)]/35">
          <h2 className="text-lg font-medium text-[var(--color-text)]">Preparing your document</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
            Remaining checkpoints run automatically. When rendering finishes, this page will show{" "}
            <strong className="text-[var(--color-text)]">Completed</strong> with download and viewer
            options.
          </p>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            Current step:{" "}
            <span className="font-medium text-[var(--color-accent)]">
              {st.replace(/_/g, " ")}
            </span>
          </p>
        </Card>
      )}

      {/* Skipped edits notice — shown as soon as field-edit responds, stays until dismissed */}
      {lastEditResult && lastEditResult.skipped.length > 0 && (
        <SkippedEditsCard
          result={lastEditResult}
          canReEdit={st === "completed"}
          onApproveAnyway={handleApproveAnyway}
          onCancelReEdit={handleCancelReEdit}
        />
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
            Pipeline is running. This page refreshes automatically. When the Word file is ready,
            you&apos;ll see <strong className="text-[var(--color-text)]">Completed</strong>—no
            checkpoint buttons required.
          </p>
        </Card>
      )}
    </div>
  );

  return (
    <>
      {sessionContent}

      {/* Document viewer / field editor — right-hand panel (see EditorSidePanel) */}
      {viewerDocxUrl && (
        <EditorSidePanel
          open={showViewer}
          onClose={closeEditorPanel}
          onExited={onEditorPanelExited}
        >
          <DocxViewer
            key={viewerDocxUrl}
            docxUrl={viewerDocxUrl}
            mode={viewerMode}
            targetFormat={statusQuery.data?.target_format ?? "giz"}
            cvData={outputQuery.data?.cv_data}
            initialEdits={pendingEdits}
            onSubmitEdits={
              viewerMode === "field_editor" ? () => fieldEditMut.mutate(pendingEdits) : undefined
            }
            submitEditsDisabled={
              viewerMode !== "field_editor" ||
              pendingEdits.length === 0 ||
              pendingEdits.some((e) => !e.instruction.trim()) ||
              fieldEditMut.isPending
            }
            submitEditsBusy={viewerMode === "field_editor" && fieldEditMut.isPending}
            onEditsChange={viewerMode === "field_editor" ? setPendingEdits : (undefined as never)}
            onClose={closeEditorPanel}
          />
        </EditorSidePanel>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// SkippedEditsCard — shown on completed when some field edits were skipped (optional follow-up)
// ---------------------------------------------------------------------------

function SkippedEditsCard({
  result,
  canReEdit,
  onApproveAnyway,
  onCancelReEdit,
}: {
  result: FieldEditResponse;
  canReEdit: boolean;
  onApproveAnyway: () => void;
  onCancelReEdit: () => void;
}) {
  return (
    <Card className="border-amber-800/40 bg-amber-950/10">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-amber-300">Edit results</h2>
        <span className="rounded bg-emerald-950/60 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
          {result.applied.length} applied
        </span>
        <span className="rounded bg-red-950/60 px-2 py-0.5 text-[10px] font-medium text-red-300">
          {result.skipped.length} skipped
        </span>
      </div>

      {result.applied.length > 0 && (
        <div className="mt-3">
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

      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400">
          Skipped — the agent could not apply these
        </p>
        <ul className="mt-2 space-y-2">
          {result.skipped.map((p, i) => {
            const item: SkippedEditItem = typeof p === "string" ? { path: p } : p;
            return (
              <li key={item.path ?? i} className="rounded-lg border border-red-900/30 bg-[var(--color-surface)] px-3 py-2">
                <code className="text-xs text-red-300">{item.path}</code>
                {item.reason && (
                  <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                    <span className="font-medium text-[var(--color-text)]">Reason: </span>
                    {item.reason}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-3 text-xs text-[var(--color-text-muted)]">
        Applied edits are written and will appear in the re-rendered output.
        {!canReEdit && " Waiting for re-render to complete before you can edit again."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={onApproveAnyway}>
          Dismiss
        </Button>
        {canReEdit && (
          <Button type="button" variant="secondary" onClick={onCancelReEdit}>
            Re-edit skipped fields
          </Button>
        )}
      </div>
    </Card>
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
        <details className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
          <summary className="cursor-pointer text-xs font-semibold text-[var(--color-text)]">
            Compression details
          </summary>
          <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap text-xs text-[var(--color-text-muted)]">
            {JSON.stringify(data.compression, null, 2)}
          </pre>
        </details>
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

