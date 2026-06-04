/**
 * TorPoolPicker — displayed at checkpoint_1_pending.
 *
 * Fetches the list of extracted ToR pools (DistilledToR entries) from
 * GET /sessions/{id}/tor/pools and presents them for selection.
 *
 * Per FRONTEND_TOR_POOL_PICKER_IMPLEMENTATION.md:
 *   - Single pool → auto-select index 0, show a minimal confirmation line
 *   - Multiple pools → render selectable cards
 *   - One click does: POST /tor/select-pool → POST /approve/checkpoint_1
 *   - Approve button is disabled until a pool is selected
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const LOADING_MESSAGES = [
  "Saving your expert pool selection…",
  "Sending approval to the pipeline…",
  "Checkpoint approved — resuming pipeline…",
  "Handing off to the AI writer…",
  "Waiting for the next stage to start…",
];

import { useAuth } from "../contexts/AuthContext";
import { formatApiError, getTorPools, approveCheckpoint, selectTorPool } from "../lib/api";
import type { TargetFormat, TorPoolsResponse } from "../lib/types";
import { Button } from "./ui";

interface TorPoolPickerProps {
  sessionId: string;
  /** GIZ uses “expert pool” copy; World Bank uses Statement of Need (SN) terminology. */
  targetFormat?: TargetFormat;
  /** Parent collapses the ToR card when approval starts. */
  onApproveStart?: (selectionLabel: string) => void;
  /** Parent re-expands the card if approval fails. */
  onApproveFailed?: () => void;
  /** Compact loading line (card header shows selection + spinner). */
  compact?: boolean;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

function PoolCard({
  pool,
  index,
  selected,
  onSelect,
  fallbackRoleLabel,
}: {
  pool: Record<string, unknown>;
  index: number;
  selected: boolean;
  onSelect: (i: number) => void;
  fallbackRoleLabel: string;
}) {
  const title =
    (pool.position_title as string | undefined) || `${fallbackRoleLabel} ${index + 1}`;
  const sector = (pool.sector as string | undefined) || "";
  const tasks = (pool.key_tasks as unknown[] | undefined) ?? [];
  const previewTasks = tasks.slice(0, 3) as string[];

  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      className={[
        "w-full rounded-xl border p-4 text-left transition-all",
        selected
          ? "border-[var(--color-accent)] bg-[var(--color-surface-muted)] shadow-sm"
          : "border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-surface)]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--color-text)]">{title}</p>
          {sector && (
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{sector}</p>
          )}
        </div>
        <span
          className={[
            "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-colors",
            selected
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
              : "border-[var(--color-border)] bg-transparent",
          ].join(" ")}
        />
      </div>
      {previewTasks.length > 0 && (
        <ul className="mt-3 space-y-1">
          {previewTasks.map((t, i) => (
            <li key={i} className="flex gap-1.5 text-xs text-[var(--color-text-muted)]">
              <span className="mt-0.5 shrink-0 text-[var(--color-accent)]">·</span>
              <span className="line-clamp-2">{t}</span>
            </li>
          ))}
          {tasks.length > 3 && (
            <li className="text-xs text-[var(--color-text-muted)] opacity-60">
              +{tasks.length - 3} more tasks
            </li>
          )}
        </ul>
      )}
    </button>
  );
}

function poolLabel(
  pool: Record<string, unknown>,
  index: number,
  wb: boolean,
): string {
  return (
    (pool.position_title as string | undefined) ||
    (wb ? `Statement of Need ${index + 1}` : `Expert Pool ${index + 1}`)
  );
}

export function TorPoolPicker({
  sessionId,
  targetFormat = "giz",
  onApproveStart,
  onApproveFailed,
  compact = false,
  onSuccess,
  onError,
}: TorPoolPickerProps) {
  const wb = targetFormat === "world_bank";
  const { accessToken } = useAuth();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);

  useEffect(() => {
    if (!submitting) return;
    const id = setInterval(
      () => setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length),
      2200,
    );
    return () => clearInterval(id);
  }, [submitting]);

  const poolsQuery = useQuery<TorPoolsResponse>({
    queryKey: ["torPools", sessionId, accessToken],
    queryFn: () => getTorPools(accessToken!, sessionId),
    enabled: !!accessToken && !!sessionId,
    retry: 5,
    refetchInterval: (q) => (q.state.error ? 3000 : false),
  });

  // Auto-select when exactly one pool
  const pools = poolsQuery.data?.pools ?? [];
  const resolvedIndex = pools.length === 1 ? 0 : selectedIndex;

  const canApprove = !submitting && resolvedIndex !== null;

  const handleApprove = async () => {
    if (resolvedIndex === null) return;
    setInlineError(null);
    onApproveStart?.(poolLabel(pools[resolvedIndex], resolvedIndex, wb));
    setSubmitting(true);
    try {
      await selectTorPool(accessToken!, sessionId, resolvedIndex);
    } catch (e) {
      setInlineError(formatApiError(e));
      setSubmitting(false);
      onApproveFailed?.();
      return;
    }
    try {
      await approveCheckpoint(accessToken!, sessionId, "checkpoint_1", "Approved from web UI");
      // Do NOT reset submitting here — keep the loading panel up until the
      // parent's status refetch completes and unmounts this component.
      // Resetting early would briefly re-show the button while the refetch
      // is in-flight, causing the user to think they need to click again.
      onSuccess();
    } catch (e) {
      const msg = formatApiError(e);
      setInlineError(msg.includes("pool") ? msg : "Checkpoint approval failed — " + msg);
      onError(msg);
      setSubmitting(false);
      onApproveFailed?.();
    }
  };

  if (poolsQuery.isLoading) {
    return (
      <p className="mt-4 text-sm text-[var(--color-text-muted)]">
        {wb ? "Loading Statements of Need from the ToR…" : "Loading ToR pools…"}
      </p>
    );
  }

  if (poolsQuery.isError) {
    return (
      <p className="mt-4 text-sm text-red-300">
        {wb ? "Could not load SN list: " : "Could not load ToR pools: "}
        {formatApiError(poolsQuery.error)}
      </p>
    );
  }

  if (submitting && compact) {
    return (
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
        {LOADING_MESSAGES[loadingMsgIdx]}
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Single pool — minimal UI */}
      {!submitting &&
        (pools.length === 1 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-text-muted)]">
          <span className="font-medium text-[var(--color-text)]">
            {(pools[0].position_title as string | undefined) ||
              (wb ? "Statement of Need 1" : "Expert Pool 1")}
          </span>
          {(pools[0].sector as string | undefined) && (
            <span className="ml-2 opacity-70">· {pools[0].sector as string}</span>
          )}
          <span className="ml-2 rounded bg-emerald-950/50 px-1.5 py-0.5 text-[10px] text-emerald-300">
            {wb ? "SN auto-selected" : "auto-selected"}
          </span>
        </div>
      ) : (
        /* Multiple pools — selectable cards */
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            {wb ? (
              <>
                This ToR contains{" "}
                <strong className="text-[var(--color-text)]">{pools.length} Statements of Need (SN)</strong>.
                Select the SN that matches this consultant assignment.
              </>
            ) : (
              <>
                This ToR describes{" "}
                <strong className="text-[var(--color-text)]">{pools.length} expert roles</strong>.
                Select the one that matches this candidate&apos;s position.
              </>
            )}
          </p>
          {pools.map((pool, i) => (
            <PoolCard
              key={i}
              pool={pool}
              index={i}
              selected={selectedIndex === i}
              onSelect={setSelectedIndex}
              fallbackRoleLabel={wb ? "SN" : "Expert Pool"}
            />
          ))}
        </div>
        ))}

      {inlineError && (
        <p className="text-xs text-red-300">{inlineError}</p>
      )}

      {submitting ? (
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-5 w-5 animate-ping rounded-full bg-[var(--color-accent)]/30" />
              <span className="inline-flex h-2.5 w-2.5 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
            </span>
            <span className="text-sm font-medium text-[var(--color-text)]">Approving…</span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            {LOADING_MESSAGES[loadingMsgIdx]}
          </p>
        </div>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={resolvedIndex !== null}
              readOnly
              className="pointer-events-none"
            />
            {resolvedIndex !== null
              ? wb
                ? "SN selected — ready to continue."
                : "Expert pool selected — ready to continue."
              : wb
                ? "Select an SN above to continue."
                : "Select an expert pool above to continue."}
          </label>

          <Button
            type="button"
            disabled={!canApprove}
            onClick={() => void handleApprove()}
          >
            {wb ? "Continue with selected SN" : "Approve & Continue"}
          </Button>
        </>
      )}
    </div>
  );
}
