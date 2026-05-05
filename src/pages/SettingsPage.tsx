import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../contexts/AuthContext";
import { fetchHealth } from "../lib/api";
import { Card } from "../components/ui";

export function SettingsPage() {
  const { user, session } = useAuth();
  const configured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

  const health = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Settings</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Environment checks and backend connectivity — no secrets are displayed.
        </p>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Supabase Auth</h2>
        <ul className="mt-3 space-y-2 text-sm text-[var(--color-text-muted)]">
          <li>
            Env configured:{" "}
            <span className={configured ? "text-emerald-400" : "text-red-400"}>
              {configured ? "yes" : "missing VITE_* keys"}
            </span>
          </li>
          <li>Logged in user: {user?.email ?? "—"}</li>
          <li>Access token refresh at: {session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : "—"}</li>
        </ul>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">API</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Base URL: {apiBase}</p>
        <p className="mt-2 text-sm">
          <span className="text-[var(--color-text-muted)]">GET /health:</span>{" "}
          {health.isLoading && "Checking…"}
          {health.isError && <span className="text-red-400">unreachable</span>}
          {health.isSuccess && (
            <span className="text-emerald-400">ok ({JSON.stringify(health.data)})</span>
          )}
        </p>
        <p className="mt-4 text-xs text-[var(--color-text-muted)]">
          Ensure your FastAPI <code className="text-[var(--color-text)]">CORS_ORIGINS</code> includes{" "}
          <code className="text-[var(--color-text)]">{window.location.origin}</code>.
        </p>
      </Card>
    </div>
  );
}
