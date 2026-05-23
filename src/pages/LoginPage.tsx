import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { PublicClientApplication } from "@azure/msal-browser";
import { motion, useReducedMotion } from "framer-motion";

import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { formatApiError } from "../lib/api";
import { MicrosoftIcon } from "../components/auth/AuthBrandIcons";
import { GoogleSsoButton } from "../components/auth/GoogleSsoButton";
import { ALLOWLIST_DENIED_MESSAGE, isEmailAllowed, normalizeEmail } from "../lib/allowedEmails";
import { APP_NAME } from "../lib/brand";
import { Card } from "../components/ui";

const PROMO_FEATURES = [
  "Fast staged flow from extraction to final render",
  "Human approval checkpoints with change history",
  "Secure access with email, Google, or Microsoft",
];

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function LoginPage() {
  const { accessToken, loading, signIn, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msBusy, setMsBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
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
      await signIn(normalizeEmail(email), password);
      navigate("/", { replace: true });
      toast("Signed in.");
    } catch (err: unknown) {
      toast(formatApiError(err), "error");
    } finally {
      setBusy(false);
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
      <motion.div className="auth-page__shell" {...motionProps}>
        <div className="auth-page__layout">
          <Card tone="session" className="auth-page__panel auth-page__panel--promo">
            <span className="auth-page__badge">{APP_NAME}</span>
            <h1 className="auth-page__promo-title">
              Build interview-ready CVs with the guided agent pipeline.
            </h1>
            <p className="auth-page__promo-lead">
              Sign in to start new sessions, review checkpoints, and download polished outputs in
              one workspace.
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
                <p className="auth-page__kicker">Sign in</p>
                <h2 className="auth-page__title">Welcome back</h2>
                <p className="auth-page__subtitle">Continue your CV drafting sessions.</p>
              </header>

              <form onSubmit={onSubmit} className="auth-page__form" noValidate>
                <div className="auth-page__field">
                  <label className="auth-page__label" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
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
                  <label className="auth-page__label" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    className="auth-page__input"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                </div>
                <button
                  type="submit"
                  className="session-btn-primary auth-page__submit"
                  disabled={busy}
                >
                  {busy ? "Signing in…" : "Sign in"}
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
                  {msBusy ? "Signing in with Microsoft…" : "Continue with Microsoft"}
                </button>
                <GoogleSsoButton
                  clientId={googleClientId}
                  disabled={msBusy}
                  busy={googleBusy}
                  onError={() => toast("Google sign-in failed.", "error")}
                  onCredential={async (credential) => {
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
                  }}
                />
              </div>

              <p className="auth-page__footer">
                Need an account?{" "}
                <Link className="auth-page__link" to="/signup">
                  Create one
                </Link>
              </p>
            </Card>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
