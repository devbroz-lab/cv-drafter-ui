import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { TERMS_AND_PRIVACY_MARKDOWN } from "../../content/terms-and-privacy";
import { TermsMarkdown } from "./TermsMarkdown";

type TermsAcceptanceModalProps = {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
  acceptDisabled?: boolean;
};

const SCROLL_THRESHOLD_PX = 32;

export function TermsAcceptanceModal({
  open,
  onClose,
  onAccept,
  acceptDisabled = false,
}: TermsAcceptanceModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  const checkScrollEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD_PX;
    setScrolledToEnd(atEnd);
  }, []);

  useEffect(() => {
    if (!open) return;
    setScrolledToEnd(false);
    const id = window.requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      if (el.scrollHeight <= el.clientHeight + 1) {
        setScrolledToEnd(true);
      } else {
        checkScrollEnd();
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, checkScrollEnd]);

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

  if (!open) return null;

  return createPortal(
    <div className="terms-modal" role="presentation">
      <button
        type="button"
        className="terms-modal__backdrop"
        aria-label="Close terms dialog"
        onClick={onClose}
      />
      <div
        className="terms-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-modal-title"
      >
        <header className="terms-modal__header">
          <h2 id="terms-modal-title" className="terms-modal__title">
            Terms and Privacy Policy
          </h2>
          <p className="terms-modal__lead">
            Please read through the terms below. You can continue with Google after you reach the
            end.
          </p>
        </header>

        <div
          ref={scrollRef}
          className="terms-modal__scroll"
          onScroll={checkScrollEnd}
          tabIndex={0}
        >
          <TermsMarkdown source={TERMS_AND_PRIVACY_MARKDOWN} />
        </div>

        <footer className="terms-modal__footer">
          {!scrolledToEnd ? (
            <p className="terms-modal__hint" aria-live="polite">
              Scroll to the bottom to accept
            </p>
          ) : null}
          {scrolledToEnd ? (
            <div className="terms-modal__actions">
              <button type="button" className="auth-page__sso-btn terms-modal__cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="session-btn-primary terms-modal__accept"
                disabled={acceptDisabled}
                onClick={onAccept}
              >
                {acceptDisabled
                  ? "Preparing Google sign-in…"
                  : "I accept the terms and conditions"}
              </button>
            </div>
          ) : null}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
