import { useCallback, useEffect, useRef } from "react";

import clsx from "clsx";

import { GoogleIcon } from "./AuthBrandIcons";

type GoogleSsoButtonProps = {
  clientId: string | undefined;
  disabled?: boolean;
  busy?: boolean;
  onCredential: (credential: string) => void | Promise<void>;
  onError: (message: string) => void;
};

export function GoogleSsoButton({
  clientId,
  disabled,
  busy,
  onCredential,
  onError,
}: GoogleSsoButtonProps) {
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

  if (!clientId) {
    return (
      <button
        type="button"
        className="auth-page__sso-btn"
        disabled={disabled || busy}
        onClick={() =>
          onError(
            "Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID on the UI service and redeploy.",
          )
        }
      >
        <GoogleIcon />
        {busy ? "Signing in with Google…" : "Continue with Google"}
      </button>
    );
  }

  useEffect(() => {
    if (!hostRef.current) return;

    const el = hostRef.current;

    const mount = () => {
      if (!window.google?.accounts?.id) return false;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
        ux_mode: "popup",
        auto_select: false,
      });
      el.innerHTML = "";
      const width = el.parentElement?.clientWidth ?? 320;
      window.google.accounts.id.renderButton(el, {
        type: "standard",
        theme: "outline",
        size: "large",
        width,
        text: "signin_with",
        logo_alignment: "left",
      });
      return true;
    };

    if (mount()) return;

    const poll = window.setInterval(() => {
      if (mount()) window.clearInterval(poll);
    }, 80);

    return () => window.clearInterval(poll);
  }, [clientId, handleCredential]);

  const label = busy ? "Signing in with Google…" : "Continue with Google";

  return (
    <div
      className={clsx(
        "auth-page__sso-btn auth-page__google-host",
        (disabled || busy) && "auth-page__google-host--disabled",
      )}
      aria-busy={busy}
    >
      <span className="auth-page__sso-btn-face" aria-hidden>
        <GoogleIcon />
        {label}
      </span>
      <div ref={hostRef} className="auth-page__google-native" aria-label={label} />
    </div>
  );
}
