import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { fetchHealth } from "../lib/api";
import { fetchMeterBalance, fetchMeterLedger, formatCredits } from "../lib/metering";
import { Card } from "../components/ui";

function ledgerEventLabel(eventType: string): string {
  switch (eventType) {
    case "grant":
      return "Welcome grant";
    case "reserve":
      return "Pipeline reserved";
    case "release":
      return "Pipeline released";
    case "pipeline_run":
      return "Pipeline completed";
    case "revision":
      return "Field revision";
    case "revision_refund":
      return "Revision refunded";
    default:
      return eventType;
  }
}

export function SettingsPage() {
  const { user, session, accessToken } = useAuth();
  const authConfigured = !!import.meta.env.VITE_AUTH_API_BASE_URL;
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
  const authBase = import.meta.env.VITE_AUTH_API_BASE_URL || "http://127.0.0.1:8000/auth";

  const health = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false,
  });

  const balance = useQuery({
    queryKey: ["metering", "balance"],
    queryFn: () => fetchMeterBalance(accessToken!),
    enabled: Boolean(accessToken),
  });

  const ledger = useQuery({
    queryKey: ["metering", "ledger"],
    queryFn: () => fetchMeterLedger(accessToken!, 50),
    enabled: Boolean(accessToken),
  });

  const rates = balance.data?.rates;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Settings</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Credits, usage history, and environment checks.
        </p>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Credits</h2>
        {balance.isLoading && (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">Loading balance…</p>
        )}
        {balance.isError && (
          <p className="mt-3 text-sm text-red-400">Could not load credit balance.</p>
        )}
        {balance.isSuccess && (
          <ul className="mt-3 space-y-2 text-sm text-[var(--color-text-muted)]">
            <li>
              Available:{" "}
              <span className="font-medium text-[var(--color-text)]">
                {formatCredits(balance.data.available_credits)}
              </span>
            </li>
            <li>
              Reserved (in-flight runs):{" "}
              <span className="font-medium text-[var(--color-text)]">
                {formatCredits(balance.data.reserved_credits)}
              </span>
            </li>
            <li>
              Total:{" "}
              <span className="font-medium text-[var(--color-text)]">
                {formatCredits(balance.data.total_credits)}
              </span>
            </li>
          </ul>
        )}
        {rates && (
          <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-[var(--color-text-muted)]">
            <p className="font-medium text-[var(--color-text)]">Current rates</p>
            <ul className="mt-2 space-y-1">
              <li>1 credit ≈ ${rates.credit_usd} USD</li>
              <li>
                Full pipeline run: {formatCredits(rates.pipeline_run_credits)} credits (~$
                {rates.pipeline_run_usd})
              </li>
              <li>
                Field revision (per apply): {formatCredits(rates.revision_credits)} credits (~$
                {rates.revision_usd})
              </li>
            </ul>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Usage history</h2>
        {ledger.isLoading && (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">Loading…</p>
        )}
        {ledger.isSuccess && ledger.data.entries.length === 0 && (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">No usage yet.</p>
        )}
        {ledger.isSuccess && ledger.data.entries.length > 0 && (
          <ul className="mt-3 divide-y divide-white/[0.06] text-sm">
            {ledger.data.entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                <div>
                  <span className="text-[var(--color-text)]">{ledgerEventLabel(entry.event_type)}</span>
                  {entry.session_id ? (
                    <Link
                      to={`/sessions/${entry.session_id}`}
                      className="ml-2 text-xs text-[var(--color-accent)] hover:underline"
                    >
                      View session
                    </Link>
                  ) : null}
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {new Date(entry.created_at).toLocaleString()}
                  </p>
                </div>
                <span
                  className={
                    Number.parseFloat(entry.amount_credits) >= 0
                      ? "text-emerald-400"
                      : "text-[var(--color-text-muted)]"
                  }
                >
                  {Number.parseFloat(entry.amount_credits) >= 0 ? "+" : ""}
                  {formatCredits(entry.amount_credits)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Authentication</h2>
        <ul className="mt-3 space-y-2 text-sm text-[var(--color-text-muted)]">
          <li>
            Env configured:{" "}
            <span className={authConfigured ? "text-emerald-400" : "text-red-400"}>
              {authConfigured ? "yes" : "missing VITE_AUTH_API_BASE_URL"}
            </span>
          </li>
          <li>Auth base URL: {authBase}</li>
          <li>Logged in user: {user?.email ?? "—"}</li>
          <li>Refresh token available: {session?.refreshToken ? "yes" : "—"}</li>
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
