import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { formatApiError } from "../lib/api";
import { Button, Card, Input, Label } from "../components/ui";

export function LoginPage() {
  const { accessToken, loading, signIn } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-16">
      <div className="mx-auto w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Welcome back</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Sign in with your Supabase account to run the pipeline.
          </p>
        </div>
        <Card>
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
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>
        <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
          Need an account?{" "}
          <Link className="text-[var(--color-accent)] hover:underline" to="/signup">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
