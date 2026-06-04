import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { SessionOutputInsights } from "../components/session/SessionAIReview";
import { SessionLivePipelineStrip } from "../components/session/SessionPipeline";
import { SessionPipelineTimeline } from "../components/session/SessionPipelineFlow";
import { FieldEditOutcomePanel } from "../components/session/FieldEditOutcomePanel";
import { useAuth } from "../contexts/AuthContext";
import { fetchMeterBalance, formatCredits, parseCredits } from "../lib/metering";
import { useToast } from "../contexts/ToastContext";
import {
  ApiError,
  approveCheckpoint,
  formatApiError,
  getManifest,
  getOutput,
  getOutputDownloadUrl,
  getSessionStatus,
  submitFieldEdits,
} from "../lib/api";
import { recentSessionLabel, upsertRecentSession } from "../lib/recentSessions";
import { livePipelineStageLabel, sessionStatusLabel } from "../lib/sessionStatusLabels";
import type {
  FieldEditItem,
  FieldEditOutcomeState,
  FieldEditResponse,
  SessionStatus,
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

function pollMsUnlessUnauthorized(
  status: SessionStatus | undefined,
  error: unknown,
): number | false {
  if (error instanceof ApiError && error.status === 401) return false;
  return pollMs(status);
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

type SessionNavState = { sourceFilename?: string };

function resolveCvDisplayName(
  sourceFilename: string | undefined | null,
  navFilename: string | undefined,
  cachedLabel: string | undefined,
): string {
  const fromApi = sourceFilename?.trim();
  if (fromApi) return fromApi;
  const fromNav = navFilename?.trim();
  if (fromNav) return fromNav;
  const fromCache = cachedLabel?.trim();
  if (fromCache) return fromCache;
  return "Your CV";
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function SessionWorkspacePage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navSourceFilename = (location.state as SessionNavState | null)?.sourceFilename;
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const reduceMotion = useReducedMotion();

  // ── Remote data ────────────────────────────────────────────────────────────

  const statusQuery = useQuery({
    queryKey: ["sessionStatus", sessionId, accessToken],
    queryFn: () => getSessionStatus(accessToken!, sessionId),
    enabled: !!accessToken && !!sessionId,
    refetchInterval: (q) => pollMsUnlessUnauthorized(q.state.data?.status, q.state.error),
  });

  const st = statusQuery.data?.status;

  const manifestQuery = useQuery({
    queryKey: ["manifest", sessionId, accessToken],
    queryFn: () => getManifest(accessToken!, sessionId),
    enabled: !!accessToken && !!sessionId && st !== undefined && st !== "queued",
    retry: false,
    refetchInterval: (q) => pollMsUnlessUnauthorized(st, q.state.error),
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

  const balanceQuery = useQuery({
    queryKey: ["metering", "balance"],
    queryFn: () => fetchMeterBalance(accessToken!),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  });

  const revisionCost = parseCredits(balanceQuery.data?.rates.revision_credits);
  const availableCredits = parseCredits(balanceQuery.data?.available_credits);
  const canAffordRevision =
    !balanceQuery.isSuccess || availableCredits >= revisionCost;

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

  useEffect(() => {
    if (statusQuery.error instanceof ApiError && statusQuery.error.status === 401) {
      toast("Session expired. Please sign in again.", "error");
    }
  }, [statusQuery.error, toast]);

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
  const [viewerMode, setViewerMode] = useState<"reference" | "field_editor">("field_editor");
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
  const [editOutcome, setEditOutcome] = useState<FieldEditOutcomeState | null>(null);

  const [cp1Collapsed, setCp1Collapsed] = useState(false);
  const [cp1SelectionLabel, setCp1SelectionLabel] = useState<string | null>(null);
  const cp1WorldBank = statusQuery.data?.target_format === "world_bank";

  useEffect(() => {
    setCp1Collapsed(false);
    setCp1SelectionLabel(null);
    setEditOutcome(null);
  }, [sessionId]);

  useEffect(() => {
    if (st !== "checkpoint_1_pending") {
      setCp1Collapsed(false);
      setCp1SelectionLabel(null);
    }
  }, [st]);

  const fieldEditMut = useMutation({
    mutationFn: (edits: FieldEditItem[]) => submitFieldEdits(accessToken!, sessionId, edits),
    onSuccess: (data: FieldEditResponse, submitted: FieldEditItem[]) => {
      void qc.invalidateQueries({ queryKey: ["sessionStatus", sessionId] });
      void qc.invalidateQueries({ queryKey: ["manifest", sessionId] });
      void qc.invalidateQueries({ queryKey: ["output", sessionId] });
      void qc.invalidateQueries({ queryKey: ["metering", "balance"] });
      setPendingEdits([]);
      setShowViewer(false);
      setEditOutcome({ result: data, submitted });

      const skipped = data.skipped ?? [];
      const applied = data.applied ?? [];

      if (skipped.length === 0) {
        toast(
          `${applied.length} edit${applied.length !== 1 ? "s" : ""} saved — see the summary below.`,
        );
      } else {
        toast(`${applied.length} applied, ${skipped.length} skipped — see the summary below.`, "error");
      }
    },
    onError: (e) => {
      toast(formatApiError(e), "error");
      setShowViewer(false);
    },
  });

  // After partial skips: dismiss notice on completed (render already ran or will complete).
  const handleDismissEditOutcome = useCallback(() => {
    setEditOutcome(null);
  }, []);

  const handleReEditSkipped = useCallback(() => {
    const applied = editOutcome?.result.applied.length ?? 0;
    const skippedCount = editOutcome?.result.skipped.length ?? 0;
    setEditOutcome(null);
    void openViewer("field_editor");
    toast(
      `${applied} edit${applied !== 1 ? "s" : ""} already applied. Refining the ${skippedCount} skipped field${skippedCount !== 1 ? "s" : ""}.`,
    );
  }, [editOutcome, openViewer, toast]);

  // ── Misc ───────────────────────────────────────────────────────────────────

  const cvDisplayName = useMemo(
    () =>
      resolveCvDisplayName(
        statusQuery.data?.source_filename,
        navSourceFilename,
        recentSessionLabel(sessionId),
      ),
    [statusQuery.data?.source_filename, sessionId, navSourceFilename],
  );

  const hasCvNameHint =
    Boolean(statusQuery.data?.source_filename?.trim()) ||
    Boolean(navSourceFilename?.trim()) ||
    Boolean(recentSessionLabel(sessionId));

  const workspaceTitle = statusQuery.isLoading && !hasCvNameHint ? "Loading…" : cvDisplayName;
  const fileLabel = cvDisplayName;

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

  const showLiveStrip = st !== "completed" && st !== "failed";

  const sessionContent = (
    <div className="session-workspace-root w-full min-w-0">
      <motion.div
        className="flex w-full min-w-0 flex-col pb-14 pt-0 sm:pb-16 sm:pt-1"
        initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="pb-1 pt-1">
          <Link className="session-link-back" to="/">
            ← Back
          </Link>

          <h1 className="mt-5 text-[1.75rem] font-medium leading-tight tracking-[-0.02em] text-[var(--chat-text,#ececec)] sm:text-[2rem]">
            {workspaceTitle}
          </h1>
          <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--chat-muted,#b4b4b4)]">
            {showLiveStrip
              ? "Working through your CV in the background — updates appear here automatically."
              : st === "completed"
              ? "Your formatted document is ready below."
              : "Session workspace"}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { k: "Status", v: sessionStatusLabel(statusQuery.data?.status) },
              { k: "Format", v: statusQuery.data?.target_format ?? "…" },
              { k: "Round", v: String(statusQuery.data?.round ?? "…") },
            ].map((pill) => (
              <span key={pill.k} className="session-meta-pill">
                <span>{pill.k}</span>
                <strong className="capitalize">{pill.v}</strong>
              </span>
            ))}
          </div>
        </header>

        {showLiveStrip && (
          <motion.div
            className="session-composer-surface session-card mt-6 p-6 sm:p-7"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <SessionLivePipelineStrip
              embedded
              status={st}
              progressPct={progressForStatus(st)}
              fileLabel={fileLabel}
            />
          </motion.div>
        )}

        <motion.div className="mt-8 flex flex-col gap-6 sm:gap-7">
          <SessionPipelineTimeline
            manifest={manifestQuery.data}
            sessionStatus={st}
            manifestLoading={manifestQuery.isLoading}
            manifestError={manifestQuery.isError}
          />

          {st === "checkpoint_1_pending" && (
            <motion.div
              key="cp1"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <Card
                tone="session"
                className={cp1Collapsed ? "session-card--gate !p-5 sm:!p-6" : "session-card--gate"}
              >
                {cp1Collapsed ? (
                  <motion.div
                    className="flex items-start justify-between gap-4"
                    layout
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="min-w-0">
                      <span className="session-card-eyebrow session-card-eyebrow--accent">
                        {cp1WorldBank ? "SN approved" : "ToR role approved"}
                      </span>
                      <h2 className="session-card-title mt-1 truncate text-base">
                        {cp1SelectionLabel}
                      </h2>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pt-0.5">
                      <span className="relative inline-flex h-5 w-5 items-center justify-center">
                        <span className="absolute inline-flex h-5 w-5 animate-ping rounded-full bg-emerald-500/25" />
                        <span className="inline-flex h-2.5 w-2.5 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                      </span>
                      <span className="text-sm text-[var(--chat-muted,#b4b4b4)]">Resuming…</span>
                    </div>
                  </motion.div>
                ) : (
                  <>
                    <div className="session-card-header">
                      <span className="session-card-eyebrow session-card-eyebrow--accent">Your input needed</span>
                      <h2 className="session-card-title">
                        {cp1WorldBank ? "Select Statement of Need" : "Select ToR role"}
                      </h2>
                    </div>
                    <p className="session-card-body !mt-0">
                      {cp1WorldBank ? (
                        <>
                          Choose the SN from the ToR that matches this consultant. Later checkpoints resume
                          automatically once you continue.
                        </>
                      ) : (
                        <>
                          Choose the expert pool that best reflects this role. The remaining workflow continues on
                          its own after approval.
                        </>
                      )}
                    </p>
                  </>
                )}
                <div className={cp1Collapsed ? "mt-3" : "mt-6"}>
                  <TorPoolPicker
                    sessionId={sessionId}
                    targetFormat={statusQuery.data?.target_format ?? "giz"}
                    compact={cp1Collapsed}
                    onApproveStart={(label) => {
                      setCp1SelectionLabel(label);
                      setCp1Collapsed(true);
                    }}
                    onApproveFailed={() => {
                      setCp1Collapsed(false);
                      setCp1SelectionLabel(null);
                    }}
                    onSuccess={() => {
                      void qc.invalidateQueries({ queryKey: ["sessionStatus", sessionId] });
                      void qc.invalidateQueries({ queryKey: ["manifest", sessionId] });
                      toast("Checkpoint 1 approved.");
                    }}
                    onError={(msg) => toast(msg, "error")}
                  />
                </div>
              </Card>
            </motion.div>
          )}

          {(st === "checkpoint_2_pending" || st === "checkpoint_3_pending") && (
            <motion.div
              key="cp-auto"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card tone="session">
                <div className="session-card-header">
                  <span className="session-card-eyebrow">Running automatically</span>
                  <h2 className="session-card-title">Finishing touches</h2>
                </div>
                <p className="session-card-body !mt-0">
                  We&apos;re finishing the remaining steps for you. When your document is ready, you&apos;ll see download
                  and viewer actions below.
                </p>
                <p className="session-meta-pill mt-4">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--chat-accent,#10a37f)]" />
                  <strong>{livePipelineStageLabel(st)}</strong>
                </p>
              </Card>
            </motion.div>
          )}

          {editOutcome && (
            <FieldEditOutcomePanel
              outcome={editOutcome}
              canReEdit={st === "completed"}
              onDismiss={handleDismissEditOutcome}
              onReEditSkipped={handleReEditSkipped}
            />
          )}

          {st === "completed" && (
            <>
              {outputQuery.data && (
                <motion.div
                  key="done"
                  initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Card tone="session" className="session-card--success">
                    <div className="session-card-header flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                      <div className="min-w-0 flex-1">
                        <span className="session-card-eyebrow session-card-eyebrow--accent">Deliverable</span>
                        <h2 className="session-card-title session-card-title--lg">
                          Your formatted CV is complete
                        </h2>
                        <p className="session-card-body">
                          Download a print-ready Word export or refine content in the document before your next pass.
                        </p>
                      </div>
                      <div className="session-icon-badge sm:mt-1">
                        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
                          <path
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    </div>

                    <SessionOutputInsights data={outputQuery.data} />

                    <div className="mt-9 flex flex-wrap gap-3 sm:mt-10">
                      <Button
                        type="button"
                        className="session-btn-primary"
                        disabled={downloading}
                        onClick={() => void runDownload()}
                      >
                        {downloading ? "Opening…" : "Download Word"}
                      </Button>
                      <Button
                        type="button"
                        className="session-btn-refine"
                        disabled={viewerLoading || (showViewer && viewerMode === "field_editor")}
                        onClick={() => void openViewer("field_editor")}
                      >
                        {viewerLoading && viewerMode === "field_editor" ? (
                          "Opening…"
                        ) : showViewer && viewerMode === "field_editor" ? (
                          "Refine open →"
                        ) : (
                          <>
                            <svg
                              viewBox="0 0 24 24"
                              className="session-btn-refine__icon"
                              aria-hidden
                            >
                              <path
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"
                              />
                            </svg>
                            Refine in document
                          </>
                        )}
                      </Button>
                    </div>

                    {showViewer && viewerMode === "field_editor" && (
                      <motion.div
                        className="mt-8 space-y-3"
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        {pendingEdits.length > 0 && (
                          <div className="session-subcard p-4">
                            <p className="text-xs font-medium text-[var(--chat-text,#ececec)]">
                              Queued edits ({pendingEdits.length}/5)
                            </p>
                            <ul className="mt-2 space-y-1.5">
                              {pendingEdits.map((e, i) => (
                                <li key={i} className="flex gap-2 text-xs text-[var(--chat-muted,#b4b4b4)]">
                                  <code className="shrink-0 text-[var(--chat-accent,#10a37f)]">{e.field_path}</code>
                                  <span className="truncate opacity-80">
                                    {e.instruction || "(add instruction)"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {pendingEdits.length > 0 && pendingEdits.some((e) => !e.instruction.trim()) && (
                          <p className="text-xs text-[var(--color-warn)]">
                            Each queued edit needs an instruction before submit.
                          </p>
                        )}
                      </motion.div>
                    )}
                  </Card>
                </motion.div>
              )}
              {!outputQuery.data && outputQuery.isLoading && (
                <Card tone="session" className="relative overflow-hidden">
                  {!reduceMotion && (
                    <div className="session-shimmer pointer-events-none absolute inset-0 opacity-30" aria-hidden />
                  )}
                  <p className="relative text-sm text-[var(--chat-muted,#b4b4b4)]">Preparing insights and download…</p>
                </Card>
              )}
            </>
          )}

          {st === "failed" && statusQuery.data?.error_message && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card tone="session" className="border-red-500/25 ring-1 ring-red-500/20">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-300/90">Run stopped</p>
                <h2 className="mt-1 text-lg font-semibold text-red-100/95">Pipeline could not finish</h2>
                <pre className="mt-4 max-h-[min(360px,50vh)] overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 text-xs leading-relaxed text-[var(--color-text-muted)] ring-1 ring-white/[0.05] editor-scrollbar">
                  {statusQuery.data.error_message}
                </pre>
              </Card>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
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
              fieldEditMut.isPending ||
              (balanceQuery.isSuccess && !canAffordRevision)
            }
            revisionCostLabel={
              balanceQuery.isSuccess
                ? `${formatCredits(revisionCost)} credits per apply`
                : undefined
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
