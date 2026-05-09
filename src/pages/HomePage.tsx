import { Link } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { loadRecentSessions, removeRecentSession } from "../lib/recentSessions";
import { Button, Card } from "../components/ui";
import { useState } from "react";

export function HomePage() {
  const { user } = useAuth();
  const [, bump] = useState(0);
  const recent = loadRecentSessions();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-7">
      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-text)]">Home</h1>
            <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
              Signed in as{" "}
              <span className="font-medium text-[var(--color-text)]">{user?.email ?? user?.id}</span>
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              Continue from a recent session or start a new reformat.
            </p>
          </div>

          <Link to="/sessions/new">
            <Button className="w-full sm:w-auto">Start new reformat</Button>
          </Link>
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">Recent sessions</h2>
        {recent.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-text-muted)]">
              No sessions yet — create one to see it listed here locally.
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {recent.map((s) => (
              <li key={s.id}>
                <Card className="flex flex-wrap items-center justify-between gap-4 border-[var(--color-border)]/80 p-4 md:p-5">
                  <div className="min-w-0">
                    <Link
                      className="block truncate text-base font-medium text-[var(--color-accent)] hover:underline"
                      to={`/sessions/${s.id}`}
                    >
                      {s.label}
                    </Link>
                    <div className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                      <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5">
                        {s.targetFormat}
                      </span>
                      <span className="mx-2">·</span>
                      <span>{new Date(s.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link to={`/sessions/${s.id}`}>
                      <Button variant="secondary" type="button">
                        Open
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => {
                        removeRecentSession(s.id);
                        bump((x) => x + 1);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
