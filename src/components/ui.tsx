import clsx from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition-[transform,box-shadow,background-color,border-color,color,opacity] duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "bg-[var(--color-accent)] text-white shadow-[0_6px_20px_rgba(217,119,87,0.32)] hover:-translate-y-px hover:bg-[#cf7256] hover:shadow-[0_10px_28px_rgba(217,119,87,0.38)] active:translate-y-0 active:scale-[0.98]",
        variant === "secondary" &&
          "border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text)] hover:border-[var(--color-accent)]/45 hover:bg-[var(--color-surface-muted)] active:scale-[0.98]",
        variant === "ghost" && "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
        variant === "danger" &&
          "bg-[var(--color-danger)]/15 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/25",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-all duration-150 placeholder:text-[var(--color-text-muted)]",
        "focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
      {children}
    </label>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "w-full min-h-[100px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-all duration-150 placeholder:text-[var(--color-text-muted)]",
        "focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20",
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  children,
  className,
  tone = "default",
}: {
  children: React.ReactNode;
  className?: string;
  /** `session` — layered glassy surface for workspace / pipeline panels */
  tone?: "default" | "session";
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl p-6",
        tone === "default" && "border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm",
        tone === "session" && "session-panel session-card p-7 sm:p-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
