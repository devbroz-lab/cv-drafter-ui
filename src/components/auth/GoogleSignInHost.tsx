import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

const POLL_MS = 100;
const MAX_WAIT_MS = 5000;

export type GoogleSignInHostHandle = {
  /** Programmatically open the Google account picker (call from a user click). */
  trigger: () => void;
};

type GoogleSignInHostProps = {
  clientId: string;
  onCredential: (credential: string) => void | Promise<void>;
  onError: (message: string) => void;
};

function findGoogleClickable(host: HTMLElement | null): HTMLElement | null {
  if (!host) return null;
  return (
    host.querySelector<HTMLElement>('[role="button"]') ??
    host.querySelector<HTMLElement>("div[tabindex='0']") ??
    host.querySelector<HTMLElement>("div[tabindex]")
  );
}

function originConfigError(): string {
  return `Add ${window.location.origin} under Authorized JavaScript origins in Google Cloud Console, then wait a few minutes and try again.`;
}

export const GoogleSignInHost = forwardRef<GoogleSignInHostHandle, GoogleSignInHostProps>(
  function GoogleSignInHost({ clientId, onCredential, onError }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const mountedRef = useRef(false);
    const clientIdRef = useRef(clientId);
    const onErrorRef = useRef(onError);

    clientIdRef.current = clientId;
    onErrorRef.current = onError;

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

    const initializeGsi = useCallback(() => {
      if (!window.google?.accounts?.id) return false;
      window.google.accounts.id.initialize({
        client_id: clientIdRef.current,
        callback: (response) => handleCredentialRef.current(response),
      });
      return true;
    }, []);

    const mountButton = useCallback(() => {
      const el = hostRef.current;
      if (!el || !initializeGsi()) return false;

      el.innerHTML = "";
      window.google!.accounts.id.renderButton(el, {
        type: "standard",
        theme: "outline",
        size: "large",
        width: 320,
        text: "signin_with",
      });
      mountedRef.current = Boolean(findGoogleClickable(el));
      return mountedRef.current;
    }, [initializeGsi]);

    useEffect(() => {
      mountedRef.current = false;
      if (mountButton()) return;

      const started = Date.now();
      const poll = window.setInterval(() => {
        if (mountButton() || Date.now() - started >= MAX_WAIT_MS) {
          window.clearInterval(poll);
        }
      }, POLL_MS);

      return () => window.clearInterval(poll);
    }, [clientId, mountButton]);

    useImperativeHandle(
      ref,
      () => ({
        trigger() {
          const started = Date.now();

          const failLoading = () => {
            onErrorRef.current(
              "Google sign-in is still loading. Check your connection, disable ad blockers, and try again.",
            );
          };

          const failOrigin = () => {
            onErrorRef.current(originConfigError());
          };

          const tryClick = (): boolean => {
            const clickable = findGoogleClickable(hostRef.current);
            if (!clickable) return false;
            clickable.click();
            return true;
          };

          const tryPrompt = () => {
            if (!window.google?.accounts?.id?.prompt) {
              scheduleRetry();
              return;
            }

            window.google.accounts.id.prompt((notification) => {
              if (notification.isNotDisplayed()) {
                const reason = notification.getNotDisplayedReason();
                if (reason === "unregistered_origin" || reason === "invalid_client") {
                  failOrigin();
                  return;
                }
                scheduleRetry();
                return;
              }

              if (notification.isSkippedMoment()) {
                const reason = notification.getSkippedReason();
                if (reason === "user_cancel" || reason === "tap_outside") return;
                if (!tryClick()) scheduleRetry();
              }
            });
          };

          const scheduleRetry = () => {
            if (Date.now() - started >= MAX_WAIT_MS) {
              if (!initializeGsi()) {
                failLoading();
                return;
              }
              if (!tryClick()) {
                failLoading();
              }
              return;
            }

            if (!mountButton() && !initializeGsi()) {
              window.setTimeout(scheduleRetry, POLL_MS);
              return;
            }

            if (tryClick()) return;

            window.setTimeout(() => {
              if (tryClick()) return;
              if (Date.now() - started >= MAX_WAIT_MS) {
                failLoading();
                return;
              }
              tryPrompt();
            }, POLL_MS);
          };

          if (!initializeGsi()) {
            scheduleRetry();
            return;
          }

          if (tryClick()) return;

          tryPrompt();
        },
      }),
      [initializeGsi, mountButton],
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
