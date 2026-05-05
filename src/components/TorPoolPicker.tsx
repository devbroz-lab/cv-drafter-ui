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
import { useState } from "react";

import { useAuth } from "../contexts/AuthContext";
import { formatApiError, getTorPools, approveCheckpoint, selectTorPool } from "../lib/api";
import type { TorPoolsResponse } from "../lib/types";
import { Button } from "./ui";

interface TorPoolPickerProps {
  sessionId: string;
  busy: boolean;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

function PoolCard({
  pool,
  index,
  selected,
  onSelect,
}: {
  pool: Record<string, unknown>;
  index: number;
  selected: boolean;
  onSelect: (i: number) => void;
}) {
  const title = (pool.position_title as string | undefined) || `Expert Pool ${index + 1}`;
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

export function TorPoolPicker({ sessionId, busy, onSuccess, onError }: TorPoolPickerProps) {
  const { accessToken } = useAuth();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const poolsQuery = useQuery<TorPoolsResponse>({
    queryKey: ["torPools", sessionId, accessToken],
    queryFn: () => getTorPools(accessToken!, sessionId),
    enabled: !!accessToken && !!sessionId,
    retry: 2,
  });

  // Auto-select when exactly one pool
  const pools = poolsQuery.data?.pools ?? [];
  const resolvedIndex = pools.length === 1 ? 0 : selectedIndex;

  const canApprove = !submitting && !busy && resolvedIndex !== null;

  const handleApprove = async () => {
    if (resolvedIndex === null) return;
    setInlineError(null);
    setSubmitting(true);
    try {
      await selectTorPool(accessToken!, sessionId, resolvedIndex);
    } catch (e) {
      const msg = formatApiError(e);
      setInlineError(msg);
      setSubmitting(false);
      return;
    }
    try {
      await approveCheckpoint(accessToken!, sessionId, "checkpoint_1", "Approved from web UI");
      onSuccess();
    } catch (e) {
      const msg = formatApiError(e);
      setInlineError(msg.includes("pool") ? msg : "Checkpoint approval failed — " + msg);
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (poolsQuery.isLoading) {
    return (
      <p className="mt-4 text-sm text-[var(--color-text-muted)]">Loading ToR pools…</p>
    );
  }

  if (poolsQuery.isError) {
    return (
      <p className="mt-4 text-sm text-red-300">
        Could not load ToR pools: {formatApiError(poolsQuery.error)}
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Single pool — minimal UI */}
      {pools.length === 1 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-text-muted)]">
          <span className="font-medium text-[var(--color-text)]">
            {(pools[0].position_title as string | undefined) || "Expert Pool 1"}
          </span>
          {(pools[0].sector as string | undefined) && (
            <span className="ml-2 opacity-70">· {pools[0].sector as string}</span>
          )}
          <span className="ml-2 rounded bg-emerald-950/50 px-1.5 py-0.5 text-[10px] text-emerald-300">
            auto-selected
          </span>
        </div>
      ) : (
        /* Multiple pools — selectable cards */
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            This ToR describes <strong className="text-[var(--color-text)]">{pools.length} expert roles</strong>.
            Select the one that matches this candidate's position.
          </p>
          {pools.map((pool, i) => (
            <PoolCard
              key={i}
              pool={pool}
              index={i}
              selected={selectedIndex === i}
              onSelect={setSelectedIndex}
            />
          ))}
        </div>
      )}

      {inlineError && (
        <p className="text-xs text-red-300">{inlineError}</p>
      )}

      <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
        <input
          type="checkbox"
          checked={resolvedIndex !== null}
          readOnly
          className="pointer-events-none"
        />
        {resolvedIndex !== null
          ? "Expert pool selected — ready to continue."
          : "Select an expert pool above to continue."}
      </label>

      <Button
        type="button"
        disabled={!canApprove}
        onClick={() => void handleApprove()}
      >
        {submitting ? "Saving selection & approving…" : busy ? "Working…" : "Approve & Continue"}
      </Button>
    </div>
  );
}
