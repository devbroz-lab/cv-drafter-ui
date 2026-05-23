import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";

import { ALLOWLIST_DENIED_MESSAGE, isEmailAllowed, normalizeEmail } from "../lib/allowedEmails";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Card } from "../components/ui";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function SignupPage() {
  const { accessToken, loading, signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const reduceMotion = useReducedMotion();

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
      toast("Account created.");
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page auth-page--signup session-workspace-root">
      <motion.div className="auth-page__shell" {...motionProps}>
        <div className="auth-page__layout auth-page__layout--narrow">
          <Card tone="session" className="auth-page__panel auth-page__panel--form">
            <header className="auth-page__form-head">
              <p className="auth-page__kicker">Get started</p>
              <h1 className="auth-page__title">Create account</h1>
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

            <p className="auth-page__footer">
              Already registered?{" "}
              <Link className="auth-page__link" to="/login">
                Sign in
              </Link>
            </p>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}
