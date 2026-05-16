import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { FieldEditResponse, SkippedEditItem } from "../../lib/types";
import { Button } from "../ui";

export function SkippedEditsPanel({
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
  const reduce = useReducedMotion();

  return (
    <motion.div
      layout
      initial={reduce ? false : { opacity: 0, y: 16, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl bg-gradient-to-b from-amber-500/[0.08] to-white/[0.02] ring-1 ring-amber-400/25"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-amber-400/15 px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Field edit outcome</h2>
        <span className="rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100/95 ring-1 ring-emerald-400/25">
          {result.applied.length} applied
        </span>
        <span className="rounded-full bg-red-500/12 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-100/95 ring-1 ring-red-400/25">
          {result.skipped.length} skipped
        </span>
      </div>

      <div className="space-y-5 px-5 py-5">
        {result.applied.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200/80">Written to document</p>
            <ul className="mt-2 space-y-1">
              {result.applied.map((p) => (
                <li key={p}>
                  <code className="text-xs text-emerald-200/90">{p}</code>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-red-200/85">Could not apply</p>
          <ul className="mt-3 space-y-2">
            <AnimatePresence initial={false}>
              {result.skipped.map((p, i) => {
                const item: SkippedEditItem = typeof p === "string" ? { path: p } : p;
                return (
                  <motion.li
                    key={item.path ?? i}
                    initial={reduce ? false : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reduce ? 0 : i * 0.05 }}
                    className="session-subcard px-3 py-2.5"
                  >
                    <code className="text-xs text-red-200/90">{item.path}</code>
                    {item.reason && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                        <span className="font-medium text-[var(--color-text)]">Why: </span>
                        {item.reason}
                      </p>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </div>

        <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
          Applied edits are already persisted. The next render reflects them in the Word output.
          {!canReEdit && " Wait for the pipeline to return to completed before editing again."}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onApproveAnyway}>
            Dismiss
          </Button>
          {canReEdit && (
            <Button type="button" variant="secondary" onClick={onCancelReEdit}>
              Re-edit skipped fields
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
