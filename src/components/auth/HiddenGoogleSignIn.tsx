import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

import { findGoogleClickable, mountGoogleSignInButton } from "./googleSignInMount";

export type HiddenGoogleSignInHandle = {
  /** Open the Google account dialog. Call synchronously from a user click handler. */
  trigger: () => boolean;
};

type HiddenGoogleSignInProps = {
  clientId: string;
  onReady?: () => void;
  onCredential: (credential: string) => void | Promise<void>;
  onError: (message: string) => void;
};

const POLL_MS = 80;

export const HiddenGoogleSignIn = forwardRef<HiddenGoogleSignInHandle, HiddenGoogleSignInProps>(
  function HiddenGoogleSignIn({ clientId, onReady, onCredential, onError }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const readyRef = useRef(false);
    const clientIdRef = useRef(clientId);
    const onErrorRef = useRef(onError);
    const onReadyRef = useRef(onReady);

    clientIdRef.current = clientId;
    onErrorRef.current = onError;
    onReadyRef.current = onReady;

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

    const handleCredentialRef = useRef(handleCredential);
    handleCredentialRef.current = handleCredential;

    const markReady = useCallback(() => {
      if (readyRef.current) return;
      readyRef.current = true;
      onReadyRef.current?.();
    }, []);

    const tryMount = useCallback(() => {
      const el = hostRef.current;
      if (!el) return false;
      const ok = mountGoogleSignInButton(
        el,
        clientIdRef.current,
        (response) => handleCredentialRef.current(response),
      );
      if (ok) markReady();
      return ok;
    }, [markReady]);

    useEffect(() => {
      readyRef.current = false;
      if (tryMount()) return;

      const poll = window.setInterval(() => {
        if (tryMount()) window.clearInterval(poll);
      }, POLL_MS);

      return () => window.clearInterval(poll);
    }, [clientId, tryMount]);

    useImperativeHandle(
      ref,
      () => ({
        trigger() {
          const clickable = findGoogleClickable(hostRef.current);
          if (!clickable) return false;
          clickable.click();
          return true;
        },
      }),
      [],
    );

    return (
      <div className="auth-page__google-host auth-page__google-host--prerender" aria-hidden>
        <div ref={hostRef} className="auth-page__google-native" />
      </div>
    );
  },
);
