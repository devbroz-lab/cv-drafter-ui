import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  approveCheckpoint,
  formatApiError,
  getManifest,
  getOutput,
  getOutputDownloadUrl,
  getPreviewDocxBuffer,
  getSessionStatus,
  submitComment,
  submitFieldEdits,
} from "../lib/api";
import { upsertRecentSession } from "../lib/recentSessions";
import type { FieldEditItem, OutputResponse, SessionStatus } from "../lib/types";

import { DocxViewer } from "../components/DocxViewer";
import { TorPoolPicker } from "../components/TorPoolPicker";
import { Button, Card, Label, Textarea } from "../components/ui";

function pollMs(status: SessionStatus | undefined): number | false {
  if (!status) return 2500;
  if (status === "completed" || status === "failed") return false;
  return 2500;
}

export function SessionWorkspacePage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

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

  const outputQuery = useQuery({
    queryKey: ["output", sessionId, accessToken],
    queryFn: () => getOutput(accessToken!, sessionId),
    enabled:
      !!accessToken &&
      !!sessionId &&
      (st === "field_editor_pending" || st === "checkpoint_3_pending" || st === "completed"),
  });

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

  const [c2Ack, setC2Ack] = useState(false);
  const [c3Ack, setC3Ack] = useState(false);
  const [revisionComment, setRevisionComment] = useState("");
  const [downloading, setDownloading] = useState(false);

  // Docx viewer state (output.docx — completed status)
  const [showDocxViewer, setShowDocxViewer] = useState(false);
  const [viewerDocxUrl, setViewerDocxUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  // Field editor state (preview.docx — field_editor_pending status)
  const [showPreviewViewer, setShowPreviewViewer] = useState(false);
  const [previewBuffer, setPreviewBuffer] = useState<ArrayBuffer | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<FieldEditItem[]>([]);

  const fieldEditMut = useMutation({
    mutationFn: (edits: FieldEditItem[]) => submitFieldEdits(accessToken!, sessionId, edits),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sessionStatus", sessionId] });
      void qc.invalidateQueries({ queryKey: ["manifest", sessionId] });
      toast("Edits queued — pipeline resuming.");
      setShowPreviewViewer(false);
      setPreviewBuffer(null);
      setPendingEdits([]);
    },
    onError: (e) => {
      const msg = formatApiError(e);
      // 501 = agent not yet implemented; surface a clear message
      toast(
        msg.includes("501") || msg.toLowerCase().includes("not yet available")
          ? "Field editor agent is not yet available — Dev 2 is implementing it."
          : msg,
        "error",
      );
    },
  });

  const commentMut = useMutation({
    mutationFn: (comment: string) => submitComment(accessToken!, sessionId, comment),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sessionStatus", sessionId] });
      void qc.invalidateQueries({ queryKey: ["manifest", sessionId] });
      void qc.invalidateQueries({ queryKey: ["output", sessionId] });
      toast("Revision queued.");
      setRevisionComment("");
    },
    onError: (e) => toast(formatApiError(e), "error"),
  });

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

  const runOpenViewer = useCallback(async () => {
    if (!accessToken) return;
    setViewerLoading(true);
    try {
      const { signed_url } = await getOutputDownloadUrl(accessToken, sessionId);
      setViewerDocxUrl(signed_url);
      setShowDocxViewer(true);
    } catch (e) {
      toast(formatApiError(e), "error");
    } finally {
      setViewerLoading(false);
    }
  }, [accessToken, sessionId, toast]);

  const runOpenPreview = useCallback(async () => {
    if (!accessToken) return;
    setPreviewLoading(true);
    try {
      const ab = await getPreviewDocxBuffer(accessToken, sessionId);
      setPreviewBuffer(ab);
      setShowPreviewViewer(true);
    } catch (e) {
      toast(formatApiError(e), "error");
    } finally {
      setPreviewLoading(false);
    }
  }, [accessToken, sessionId, toast]);

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

  // When the viewer is open it sits as a fixed overlay on the right 55vw.
  // We push the page content left by adding matching right-padding so nothing
  // is hidden underneath it.
  const pageStyle = showDocxViewer ? { paddingRight: "55vw" } : undefined;

  const sessionContent = (
    <div className="space-y-6" style={pageStyle}>
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
            Agents extracted the CV and summarised the Terms of Reference. Select the expert role
            this candidate is being submitted for, then approve to continue with CV–ToR mapping.
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

      {st === "checkpoint_2_pending" && (
        <CheckpointCard
          title="Checkpoint 2 — Mapping complete"
          description="Review the mapping outcome in your manifest, then approve to run field generation and review."
          acknowledged={c2Ack}
          onAckChange={setC2Ack}
          onApprove={() => approveMut.mutate("checkpoint_2")}
          busy={approveMut.isPending}
        />
      )}

      {/* Field editor — preview render ready, awaiting targeted edits */}
      {st === "field_editor_pending" && (
        <Card>
          <h2 className="text-lg font-medium text-[var(--color-text)]">
            Review &amp; Edit Generated Content
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            A preview of the formatted document has been generated. Open it to review the
            content, click any field to target it for editing, add your instruction, then
            apply. Up to 5 targeted edits per round.
          </p>

          {outputQuery.data && <OutputSummary data={outputQuery.data} />}

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={previewLoading || showPreviewViewer}
              onClick={() => void runOpenPreview()}
            >
              {previewLoading
                ? "Loading preview…"
                : showPreviewViewer
                ? "Preview open →"
                : "View Preview Document"}
            </Button>
          </div>

          {pendingEdits.length > 0 && (
            <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs">
              <p className="font-semibold text-[var(--color-text)]">
                Queued edits ({pendingEdits.length}/5)
              </p>
              <ul className="mt-2 space-y-1.5">
                {pendingEdits.map((e, i) => (
                  <li key={i} className="flex gap-2 text-[var(--color-text-muted)]">
                    <code className="shrink-0 text-[var(--color-accent)]">{e.field_path}</code>
                    <span className="truncate opacity-70">{e.instruction || "(no instruction yet)"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
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
                : `Apply ${pendingEdits.length} edit${pendingEdits.length !== 1 ? "s" : ""} & continue`}
            </Button>
          </div>

          {pendingEdits.length > 0 && pendingEdits.some((e) => !e.instruction.trim()) && (
            <p className="mt-2 text-xs text-amber-300">
              All edits need an instruction before submitting.
            </p>
          )}
        </Card>
      )}

      {st === "checkpoint_3_pending" && outputQuery.data && (
        <Card>
          <h2 className="text-lg font-medium text-[var(--color-text)]">Checkpoint 3 — Ready to render</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Review generated content and compression below, then approve to build the Word output.
          </p>
          <OutputSummary data={outputQuery.data} />

          <label className="mt-6 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <input type="checkbox" checked={c3Ack} onChange={(e) => setC3Ack(e.target.checked)} />
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

      {st === "completed" && (
        <>
          {outputQuery.data && (
            <Card>
              <h2 className="text-lg font-medium text-[var(--color-text)]">Completed</h2>
              <OutputSummary data={outputQuery.data} />

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
                  disabled={viewerLoading || showDocxViewer}
                  onClick={() => void runOpenViewer()}
                >
                  {viewerLoading ? "Loading…" : showDocxViewer ? "Viewer open →" : "View Document"}
                </Button>
              </div>

              <div className="mt-8 border-t border-[var(--color-border)] pt-6">
                <Label htmlFor="rev">Request a revision</Label>
                <Textarea
                  id="rev"
                  className="mt-2"
                  placeholder="Recruiter feedback for the next round…"
                  value={revisionComment}
                  onChange={(e) => setRevisionComment(e.target.value)}
                />
                <Button
                  className="mt-3"
                  variant="secondary"
                  type="button"
                  disabled={!revisionComment.trim() || commentMut.isPending}
                  onClick={() => commentMut.mutate(revisionComment.trim())}
                >
                  {commentMut.isPending ? "Submitting…" : "Submit feedback & re-run agents"}
                </Button>
              </div>
            </Card>
          )}
          {!outputQuery.data && outputQuery.isLoading && (
            <Card>
              <p className="text-sm text-[var(--color-text-muted)]">Loading output…</p>
            </Card>
          )}
        </>
      )}

      {st === "failed" && statusQuery.data?.error_message && (
        <Card>
          <h2 className="text-lg font-medium text-red-300">Failed</h2>
          <pre className="mt-4 whitespace-pre-wrap text-sm text-[var(--color-text-muted)]">
            {statusQuery.data.error_message}
          </pre>
        </Card>
      )}

      {(st === "queued" || st === "processing") && (
        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">
            Pipeline is running. This page refreshes automatically. When a checkpoint is reached, approve it
            here.
          </p>
        </Card>
      )}
    </div>
  );

  return (
    <>
      {sessionContent}

      {/* output.docx viewer — completed status, reference mode */}
      {showDocxViewer && viewerDocxUrl && (
        <DocxViewer
          docxUrl={viewerDocxUrl}
          mode="reference"
          targetFormat={statusQuery.data?.target_format ?? "giz"}
          onClose={() => {
            setShowDocxViewer(false);
            setViewerDocxUrl(null);
          }}
        />
      )}

      {/* preview.docx viewer — field_editor_pending status, field_editor mode */}
      {showPreviewViewer && previewBuffer && (
        <DocxViewer
          docxBuffer={previewBuffer}
          mode="field_editor"
          targetFormat={statusQuery.data?.target_format ?? "giz"}
          onEditsChange={setPendingEdits}
          onClose={() => {
            setShowPreviewViewer(false);
            setPreviewBuffer(null);
          }}
        />
      )}
    </>
  );
}

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
        <input type="checkbox" checked={props.acknowledged} onChange={(e) => props.onAckChange(e.target.checked)} />I have
        reviewed the results and approve continuing.
      </label>
      <Button className="mt-4" type="button" disabled={!props.acknowledged || props.busy} onClick={props.onApprove}>
        {props.busy ? "Working…" : "Approve checkpoint"}
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ReviewInfoCard — informational display of AI review results (non-blocking)
// ---------------------------------------------------------------------------

function ReviewInfoCard({ data }: { data: OutputResponse }) {
  const review = data.review;
  if (!review) return null;

  const highs = review.high_severity ?? [];
  const lows = review.low_severity ?? [];

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

      {/* High severity — informational only */}
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
                {h.field && (
                  <code className="rounded bg-[var(--color-border)]/30 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-accent)]">
                    {h.field}
                  </code>
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

      {/* Low severity — collapsible */}
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
                <p>{l.issue ?? "—"}</p>
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
          <pre className="mt-2 whitespace-pre-wrap text-xs">{JSON.stringify(data.compression, null, 2)}</pre>
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

      {/* AI Review info card — shown at the end as non-blocking information */}
      <ReviewInfoCard data={data} />

      <details className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
        <summary className="cursor-pointer text-xs font-medium text-[var(--color-text)]">Raw CV data (JSON)</summary>
        <pre className="mt-3 max-h-[400px] overflow-auto text-xs text-[var(--color-text-muted)]">
          {JSON.stringify(data.cv_data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
