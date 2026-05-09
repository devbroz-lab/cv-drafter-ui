import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { PublicClientApplication } from "@azure/msal-browser";

import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { formatApiError } from "../lib/api";
import { Button, Card, Input, Label } from "../components/ui";

export function LoginPage() {
  const { accessToken, loading, signIn, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msBusy, setMsBusy] = useState(false);

  const microsoftClientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;

  if (!loading && accessToken) return <Navigate to="/" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn(email, password);
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 top-12 h-72 w-72 rounded-full bg-[var(--color-accent-soft)] blur-3xl" />
        <div className="absolute -right-16 bottom-10 h-72 w-72 rounded-full bg-[var(--color-accent-soft)] blur-3xl" />
      </div>

      <div className="relative mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr,0.9fr]">
        <Card className="hidden border-[var(--color-accent-soft)] bg-[var(--color-surface-raised)]/70 p-10 lg:block">
          <span className="inline-block rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text-muted)]">
            CV Drafter
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-tight text-[var(--color-text)]">
            Build interview-ready CVs with the guided agent pipeline.
          </h1>
          <p className="mt-4 max-w-md text-base text-[var(--color-text-muted)]">
            Sign in to start new sessions, review checkpoints, and download polished outputs in one workspace.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-[var(--color-text-muted)]">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
              Fast staged flow from extraction to final render
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
              Human approval checkpoints with change history
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
              Secure account access with email or Google
            </div>
          </div>
        </Card>

        <Card className="border-[var(--color-border)] bg-[var(--color-surface)]/95 p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-[var(--color-text)]">Welcome back</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Sign in to continue your CV drafting sessions.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--color-border)]" />
            <span className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">or</span>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
            <div className="space-y-3">
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={msBusy}
                  onClick={() => void onMicrosoftSignIn()}
                >
                  {msBusy ? "Signing in with Microsoft…" : "Continue with Microsoft"}
                </Button>
              </div>
              <GoogleLogin
                onSuccess={async (credentialResponse) => {
                  if (!credentialResponse.credential) {
                    toast("Google login did not return a credential.", "error");
                    return;
                  }
                  try {
                    await signInWithGoogle(credentialResponse.credential);
                    navigate("/", { replace: true });
                    toast("Signed in with Google.");
                  } catch (err: unknown) {
                    toast(formatApiError(err), "error");
                  }
                }}
                onError={() => toast("Google sign-in failed.", "error")}
                theme="outline"
                size="large"
                text="signin_with"
                shape="rectangular"
              />
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
            Need an account?{" "}
            <Link className="text-[var(--color-accent)] hover:underline" to="/signup">
              Create one
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
