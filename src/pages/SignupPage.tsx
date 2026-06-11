import { useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { PublicClientApplication } from "@azure/msal-browser";
import { motion, useReducedMotion } from "framer-motion";

import { GoogleIcon, MicrosoftIcon } from "../components/auth/AuthBrandIcons";
import {
  HiddenGoogleSignIn,
  type HiddenGoogleSignInHandle,
} from "../components/auth/HiddenGoogleSignIn";
import { TermsAcceptanceModal } from "../components/auth/TermsAcceptanceModal";
import { BrandWordmark } from "../components/BrandWordmark";
import { ThemeToggle } from "../components/ThemeToggle";
import { Card } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { formatApiError } from "../lib/api";
import { ALLOWLIST_DENIED_MESSAGE, isEmailAllowed, normalizeEmail } from "../lib/allowedEmails";

const PROMO_FEATURES = [
  "Fast staged flow from extraction to final render",
  "Human approval checkpoints with change history",
  "Secure access with email, Google, or Microsoft",
];

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function SignupPage() {
  const { accessToken, loading, signUp, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msBusy, setMsBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [googleSignInReady, setGoogleSignInReady] = useState(false);
  const googleSignInRef = useRef<HiddenGoogleSignInHandle>(null);
  const reduceMotion = useReducedMotion();

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const microsoftClientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;

  if (!loading && accessToken) return <Navigate to="/" replace />;

  const motionProps = reduceMotion
    ? {}
    : {
        initial: "hidden" as const,
        animate: "show" as const,
        variants: fadeUp,
        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
      };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEmailAllowed(email)) {
      toast(ALLOWLIST_DENIED_MESSAGE, "error");
      return;
    }
    setBusy(true);
    try {
      await signUp(normalizeEmail(email), password);
      navigate("/", { replace: true });
      toast("Account created.");
    } catch (err: unknown) {
      toast(formatApiError(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function completeGoogleSignIn(credential: string) {
    setGoogleBusy(true);
    try {
      await signInWithGoogle(credential);
      navigate("/", { replace: true });
      toast("Signed in with Google.");
    } catch (err: unknown) {
      toast(formatApiError(err), "error");
    } finally {
      setGoogleBusy(false);
    }
  }

  function onGoogleButtonClick() {
    if (!googleClientId) {
      toast(
        "Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID on the UI service and redeploy.",
        "error",
      );
      return;
    }
    setTermsOpen(true);
  }

  function onTermsAccepted() {
    const opened = googleSignInRef.current?.trigger() ?? false;
    setTermsOpen(false);
    if (!opened) {
      toast(
        "Google sign-in is still loading. Wait a moment, then click Continue with Google again.",
        "error",
      );
    }
  }

  async function onMicrosoftSignIn() {
    if (!microsoftClientId) {
      toast("Microsoft login is not configured (VITE_MICROSOFT_CLIENT_ID).", "error");
      return;
    }
    setMsBusy(true);
    try {
      const pca = new PublicClientApplication({
        auth: {
          clientId: microsoftClientId,
          authority: "https://login.microsoftonline.com/common",
          redirectUri: window.location.origin,
        },
      });
      await pca.initialize();
      const result = await pca.loginPopup({
        scopes: ["openid", "profile", "email"],
        prompt: "select_account",
      });
      if (!result.idToken) {
        toast("Microsoft login did not return an ID token.", "error");
        return;
      }
      await signInWithMicrosoft(result.idToken);
      navigate("/", { replace: true });
      toast("Signed in with Microsoft.");
    } catch (err: unknown) {
      toast(formatApiError(err), "error");
    } finally {
      setMsBusy(false);
    }
  }

  return (
    <div className="auth-page session-workspace-root">
      <div className="auth-page__theme">
        <ThemeToggle />
      </div>
      <motion.div className="auth-page__shell" {...motionProps}>
        <div className="auth-page__layout">
          <Card tone="session" className="auth-page__panel auth-page__panel--promo">
            <div className="auth-page__brand">
              <BrandWordmark size="auth" />
            </div>
            <h1 className="auth-page__promo-title">
              Build interview-ready CVs with the guided agent pipeline.
            </h1>
            <p className="auth-page__promo-lead">
              Create an account to start new sessions, review checkpoints, and download polished
              outputs in one workspace.
            </p>
            <div className="auth-page__features">
              {PROMO_FEATURES.map((text) => (
                <div key={text} className="auth-page__feature">
                  {text}
                </div>
              ))}
            </div>
          </Card>

          <motion.div
            {...(reduceMotion
              ? {}
              : {
                  initial: { opacity: 0, y: 12 },
                  animate: { opacity: 1, y: 0 },
                  transition: { duration: 0.5, delay: 0.06, ease: [0.22, 1, 0.36, 1] },
                })}
          >
            <Card tone="session" className="auth-page__panel auth-page__panel--form">
              <header className="auth-page__form-head">
                <div className="auth-page__form-brand">
                  <BrandWordmark size="auth" />
                </div>
                <p className="auth-page__kicker">Get started</p>
                <h2 className="auth-page__title">Create account</h2>
                <p className="auth-page__subtitle">
                  Start and manage CV drafting sessions in your workspace.
                </p>
              </header>

              <form onSubmit={onSubmit} className="auth-page__form" noValidate>
                <div className="auth-page__field">
                  <label className="auth-page__label" htmlFor="signup-email">
                    Email
                  </label>
                  <input
                    id="signup-email"
                    className="auth-page__input"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                  />
                </div>
                <div className="auth-page__field">
                  <label className="auth-page__label" htmlFor="signup-password">
                    Password
                  </label>
                  <input
                    id="signup-password"
                    className="auth-page__input"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
                <button
                  type="submit"
                  className="session-btn-primary auth-page__submit"
                  disabled={busy}
                >
                  {busy ? "Creating…" : "Create account"}
                </button>
              </form>

              <div className="auth-page__divider" role="separator">
                <span className="auth-page__divider-line" />
                <span className="auth-page__divider-label">or</span>
                <span className="auth-page__divider-line" />
              </div>

              <div className="auth-page__sso">
                <button
                  type="button"
                  className="auth-page__sso-btn"
                  disabled={msBusy || googleBusy}
                  onClick={() => void onMicrosoftSignIn()}
                >
                  <MicrosoftIcon />
                  {msBusy ? "Signing up with Microsoft…" : "Continue with Microsoft"}
                </button>
                <button
                  type="button"
                  className="auth-page__sso-btn"
                  disabled={msBusy || googleBusy}
                  onClick={onGoogleButtonClick}
                >
                  <GoogleIcon />
                  {googleBusy ? "Signing up with Google…" : "Continue with Google"}
                </button>
                {googleClientId ? (
                  <HiddenGoogleSignIn
                    ref={googleSignInRef}
                    clientId={googleClientId}
                    onReady={() => setGoogleSignInReady(true)}
                    onError={(message) => toast(message, "error")}
                    onCredential={completeGoogleSignIn}
                  />
                ) : null}
                <TermsAcceptanceModal
                  open={termsOpen}
                  onClose={() => setTermsOpen(false)}
                  onAccept={onTermsAccepted}
                  acceptDisabled={!googleSignInReady}
                />
              </div>

              <p className="auth-page__footer">
                Already registered?{" "}
                <Link className="auth-page__link" to="/login">
                  Sign in
                </Link>
              </p>
            </Card>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
