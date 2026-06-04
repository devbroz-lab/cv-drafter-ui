import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
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
  const { accessToken } = useAuth();
  const { theme } = useTheme();

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Settings</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Appearance, credits, and usage history.
        </p>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Appearance</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Warm off-white light mode for long sessions. Preference is saved on this device.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-[var(--color-text)]">
            Current: <span className="font-medium capitalize">{theme}</span>
          </span>
          <ThemeToggle className="!m-0 !w-auto" />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Credits</h2>
        {balance.isLoading && (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">Loading balance…</p>
        )}
        {balance.isError && (
          <p className="mt-3 text-sm text-red-400">Could not load credit balance.</p>
        )}
        {balance.isSuccess && (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            Available:{" "}
            <span className="text-lg font-semibold text-[var(--color-text)]">
              {formatCredits(balance.data.available_credits)}
            </span>
          </p>
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
          <ul className="mt-3 divide-y divide-[var(--color-border-subtle)] text-sm">
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
    </div>
  );
}
