import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

export type GoogleSignInHostHandle = {
  /** Programmatically open the Google account picker (call from a user click). */
  trigger: () => void;
};

type GoogleSignInHostProps = {
  clientId: string;
  onCredential: (credential: string) => void | Promise<void>;
  onError: (message: string) => void;
};

export const GoogleSignInHost = forwardRef<GoogleSignInHostHandle, GoogleSignInHostProps>(
  function GoogleSignInHost({ clientId, onCredential, onError }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);

    const handleCredential = useCallback(
      (response: { credential?: string }) => {
        if (response.credential) {
          void onCredential(response.credential);
        } else {
          onError(
            "Google did not return a sign-in token. Add this site URL under Authorized JavaScript origins in Google Cloud Console.",
          );
        }
      },
      [onCredential, onError],
    );

    useEffect(() => {
      const el = hostRef.current;
      if (!el) return;

      const mount = () => {
        if (!window.google?.accounts?.id) return false;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredential,
        });
        el.innerHTML = "";
        window.google.accounts.id.renderButton(el, {
          type: "standard",
          theme: "outline",
          size: "large",
          width: 320,
          text: "signin_with",
        });
        return true;
      };

      if (mount()) return;

      const poll = window.setInterval(() => {
        if (mount()) window.clearInterval(poll);
      }, 80);

      return () => window.clearInterval(poll);
    }, [clientId, handleCredential]);

    useImperativeHandle(
      ref,
      () => ({
        trigger() {
          const el = hostRef.current;
          if (!el) return;
          const clickable =
            el.querySelector<HTMLElement>('[role="button"]') ??
            el.querySelector<HTMLElement>("div[tabindex]");
          if (clickable) {
            clickable.click();
            return;
          }
          onError("Google sign-in is still loading. Try again in a moment.");
        },
      }),
      [onError],
    );

    return (
      <div
        ref={hostRef}
        className="terms-modal__google-host"
        aria-hidden
        tabIndex={-1}
      />
    );
  },
);
