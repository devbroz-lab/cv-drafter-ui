/**
 * EditorSidePanel — premium docked document workspace.
 *
 * Full-viewport overlay with a frosted dim layer; the editor docks flush to the
 * right edge with glass depth, smooth motion, and an exit callback for teardown.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PANEL_MS = 480;
const BACKDROP_MS = 420;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export type EditorSidePanelProps = {
  open: boolean;
  onClose: () => void;
  onExited?: () => void;
  children: React.ReactNode;
};

export function EditorSidePanel({ open, onClose, onExited, children }: EditorSidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);
  const exitedRef = useRef(false);
  const hasBeenOpenRef = useRef(false);

  useLayoutEffect(() => {
    if (open) {
      hasBeenOpenRef.current = true;
      exitedRef.current = false;
      const id = window.requestAnimationFrame(() => setEntered(true));
      return () => window.cancelAnimationFrame(id);
    }
    setEntered(false);
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handlePanelTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.target !== panelRef.current) return;
      if (e.propertyName !== "transform") return;
      if (open || exitedRef.current) return;
      exitedRef.current = true;
      onExited?.();
    },
    [open, onExited],
  );

  useEffect(() => {
    if (open || !hasBeenOpenRef.current) return;
    const t = window.setTimeout(() => {
      if (!exitedRef.current) {
        exitedRef.current = true;
        onExited?.();
      }
    }, PANEL_MS + 100);
    return () => window.clearTimeout(t);
  }, [open, onExited]);

  const backdropOn = open && entered;
  const motion = "editor-motion-safe";

  const shell = (
    <div
      className={`pointer-events-none fixed inset-0 z-40 flex justify-end ${motion}`}
      aria-hidden={!open}
    >
      {/* Dim + frosted layer — focuses attention on the page behind */}
      <div
        role="presentation"
        className={[
          "absolute inset-0 bg-gradient-to-br from-black/55 via-black/45 to-black/35 backdrop-blur-md transition-[opacity,backdrop-filter]",
          motion,
          backdropOn ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        style={{
          transitionDuration: `${BACKDROP_MS}ms`,
          transitionTimingFunction: EASE,
        }}
        onClick={onClose}
      />

      {/* Docked workspace */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Document workspace"
        onTransitionEnd={handlePanelTransitionEnd}
        className={[
          "pointer-events-auto relative flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden",
          "border-l border-white/[0.07] shadow-[-48px_0_120px_-24px_rgba(0,0,0,0.75)]",
          "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent",
          motion,
          "min-[480px]:w-[min(99vw,960px)] lg:w-[min(94vw,1520px)] xl:w-[min(92vw,1720px)] 2xl:w-[min(90vw,1880px)]",
          entered && open ? "translate-x-0" : "translate-x-[102%]",
        ].join(" ")}
        style={{
          background: "var(--editor-panel-bg)",
          backdropFilter: "blur(12px) saturate(1.08)",
          WebkitBackdropFilter: "blur(12px) saturate(1.08)",
          transitionProperty: "transform",
          transitionDuration: `${PANEL_MS}ms`,
          transitionTimingFunction: EASE,
        }}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(shell, document.body);
}
