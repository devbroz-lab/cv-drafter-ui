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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Home</h1>
        <p className="mt-2 text-[var(--color-text-muted)]">
          Signed in as <span className="text-[var(--color-text)]">{user?.email ?? user?.id}</span>.
        </p>
      </div>

      <Link to="/sessions/new">
        <Button className="w-full sm:w-auto">Start a new reformat</Button>
      </Link>

      <div>
        <h2 className="mb-3 text-lg font-medium text-[var(--color-text)]">Recent sessions</h2>
        {recent.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-text-muted)]">
              No sessions yet — create one to see it listed here locally.
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {recent.map((s) => (
              <li key={s.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <Link
                      className="font-medium text-[var(--color-accent)] hover:underline"
                      to={`/sessions/${s.id}`}
                    >
                      {s.label}
                    </Link>
                    <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                      {s.targetFormat} · {new Date(s.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
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
      </div>
    </div>
  );
}
