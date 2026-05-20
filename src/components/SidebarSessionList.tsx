import { useEffect } from "react";
import { NavLink, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import clsx from "clsx";

import { useAuth } from "../contexts/AuthContext";
import { listSessions } from "../lib/api";
import { sessionStatusLabel } from "../lib/sessionStatusLabels";
import { upsertRecentSession } from "../lib/recentSessions";
import type { SessionSummary } from "../lib/types";

function sessionTimestamp(s: SessionSummary): string {
  return s.updated_at ?? s.created_at ?? new Date().toISOString();
}

export function SidebarSessionList({ collapsed }: { collapsed: boolean }) {
  const { accessToken } = useAuth();
  const { sessionId: activeId } = useParams<{ sessionId?: string }>();

  const sessionsQuery = useQuery({
    queryKey: ["sessions", "list"],
    queryFn: () => listSessions(accessToken!),
    enabled: !!accessToken,
  });

  const sessions = sessionsQuery.data?.sessions ?? [];

  useEffect(() => {
    if (!sessionsQuery.data?.sessions.length) return;
    for (const s of sessionsQuery.data.sessions) {
      upsertRecentSession({
        id: s.session_id,
        label: s.source_filename,
        targetFormat: s.target_format,
        updatedAt: sessionTimestamp(s),
      });
    }
  }, [sessionsQuery.data]);

  if (collapsed) return null;

  return (
    <div className="app-shell-sidebar-sessions" aria-label="Recent reformats">
      <p className="app-shell-sidebar-sessions-label">Recent</p>
      <div className="app-shell-sidebar-sessions-list editor-scrollbar">
        {sessionsQuery.isLoading && (
          <p className="app-shell-sidebar-sessions-empty">Loading…</p>
        )}
        {sessionsQuery.isError && (
          <p className="app-shell-sidebar-sessions-empty">Could not load sessions</p>
        )}
        {sessionsQuery.isSuccess && sessions.length === 0 && (
          <p className="app-shell-sidebar-sessions-empty">No sessions yet</p>
        )}
        {sessionsQuery.isSuccess && sessions.length > 0 && (
          <ul className="app-shell-sidebar-sessions-ul">
            {sessions.map((s) => (
              <li key={s.session_id}>
                <NavLink
                  to={`/sessions/${s.session_id}`}
                  title={s.source_filename}
                  className={({ isActive }) =>
                    clsx(
                      "app-shell-sidebar-session-link",
                      (isActive || activeId === s.session_id) && "app-shell-sidebar-session-link--active",
                    )
                  }
                >
                  <span className="app-shell-sidebar-session-link-title">{s.source_filename}</span>
                  <span className="app-shell-sidebar-session-link-meta">
                    {sessionStatusLabel(s.status)}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
