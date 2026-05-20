import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";

import { useAuth } from "../contexts/AuthContext";
import { listSessions } from "../lib/api";
import { upsertRecentSession } from "../lib/recentSessions";
import { sessionStatusLabel } from "../lib/sessionStatusLabels";
import type { SessionSummary } from "../lib/types";
import { Card } from "../components/ui";

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

function OpenIcon() {
  return (
    <svg viewBox="0 0 16 16" className="home-page__btn-open-icon" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8h9M9 5l3 3-3 3"
      />
    </svg>
  );
}

function CtaIcon() {
  return (
    <svg viewBox="0 0 16 16" className="home-page__cta-icon" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        d="M8 3.5v9M4.5 8h7"
      />
    </svg>
  );
}

function sessionTimestamp(s: SessionSummary): string {
  return s.updated_at ?? s.created_at ?? new Date().toISOString();
}

export function HomePage() {
  const { user, accessToken } = useAuth();
  const reduceMotion = useReducedMotion();

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

  const motionProps = reduceMotion
    ? {}
    : {
        initial: "hidden" as const,
        animate: "show" as const,
        variants: fadeUp,
        transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div className="session-workspace-root home-page w-full min-w-0 pb-14">
      <motion.header className="home-page__hero" {...motionProps}>
        <p className="home-page__kicker">Workspace</p>
        <h1 className="home-page__title">Home</h1>
        <p className="home-page__lead">Continue a recent session or start a new reformat.</p>
        <span className="home-page__identity">
          Signed in as <span className="home-page__email">{user?.email ?? user?.id}</span>
        </span>
        <div className="home-page__actions">
          <Link to="/sessions/new" className="session-btn-primary home-page__cta">
            <CtaIcon />
            Start new reformat
          </Link>
        </div>
      </motion.header>

      <motion.section
        className="home-page__section"
        aria-labelledby="recent-sessions-heading"
        {...(reduceMotion
          ? {}
          : {
              initial: "hidden",
              animate: "show",
              variants: fadeUp,
              transition: { duration: 0.45, delay: 0.06, ease: [0.22, 1, 0.36, 1] },
            })}
      >
        <div className="home-page__section-head">
          <h2 id="recent-sessions-heading" className="home-page__section-title">
            Your sessions
          </h2>
          <p className="home-page__section-desc">Synced with your account</p>
        </div>

        {sessionsQuery.isLoading && (
          <Card tone="session" className="home-page__empty">
            <p className="home-page__empty-text">Loading sessions…</p>
          </Card>
        )}

        {sessionsQuery.isError && (
          <Card tone="session" className="home-page__empty">
            <p className="home-page__empty-text">
              Could not load sessions. Check your connection and refresh the page.
            </p>
          </Card>
        )}

        {sessionsQuery.isSuccess && sessions.length === 0 && (
          <Card tone="session" className="home-page__empty">
            <p className="home-page__empty-text">
              No sessions yet — create one to see it listed here.
            </p>
          </Card>
        )}

        {sessionsQuery.isSuccess && sessions.length > 0 && (
          <ul className="home-page__list">
            {sessions.map((s, index) => {
              const updatedAt = sessionTimestamp(s);
              return (
                <motion.li
                  key={s.session_id}
                  {...(reduceMotion
                    ? {}
                    : {
                        initial: { opacity: 0, y: 8 },
                        animate: { opacity: 1, y: 0 },
                        transition: {
                          duration: 0.4,
                          delay: 0.08 + index * 0.04,
                          ease: [0.22, 1, 0.36, 1],
                        },
                      })}
                >
                  <Card tone="session" className="home-page__session-card">
                    <article className="home-page__session-row">
                      <div className="home-page__session-main">
                        <Link
                          className="home-page__session-link"
                          to={`/sessions/${s.session_id}`}
                        >
                          {s.source_filename}
                        </Link>
                        <div className="home-page__session-meta">
                          <span className="home-page__format-pill">
                            <span>Format</span>
                            <strong className="capitalize">
                              {s.target_format.replace(/_/g, " ")}
                            </strong>
                          </span>
                          <span className="home-page__format-pill">
                            <span>Status</span>
                            <strong>{sessionStatusLabel(s.status)}</strong>
                          </span>
                          <span className="home-page__meta-dot" aria-hidden />
                          <time className="home-page__session-date" dateTime={updatedAt}>
                            {new Date(updatedAt).toLocaleString()}
                          </time>
                        </div>
                      </div>
                      <div className="home-page__session-actions">
                        <Link
                          to={`/sessions/${s.session_id}`}
                          className="home-page__btn-open"
                        >
                          Open
                          <OpenIcon />
                        </Link>
                      </div>
                    </article>
                  </Card>
                </motion.li>
              );
            })}
          </ul>
        )}
      </motion.section>
    </div>
  );
}
