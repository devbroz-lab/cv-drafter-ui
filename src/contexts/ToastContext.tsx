import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import clsx from "clsx";

type Toast = { id: number; message: string; variant: "info" | "error" };

type ToastCtx = {
  toast: (message: string, variant?: Toast["variant"]) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const toast = useCallback((message: string, variant: Toast["variant"] = "info") => {
    const id = ++toastId;
    setItems((t) => [...t, { id, message, variant }]);
    setTimeout(() => {
      setItems((t) => t.filter((x) => x.id !== id));
    }, 5000);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "pointer-events-auto max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg",
              t.variant === "error"
                ? "border-red-900/80 bg-red-950/95 text-red-100"
                : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const x = useContext(Ctx);
  if (!x) throw new Error("useToast must be inside ToastProvider");
  return x;
}
