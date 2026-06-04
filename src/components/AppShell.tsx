import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";

import clsx from "clsx";

import { useAuth } from "../contexts/AuthContext";
import { APP_NAME } from "../lib/brand";
import { CreditBalance } from "./CreditBalance";
import { SidebarSessionList } from "./SidebarSessionList";

const SIDEBAR_STORAGE_KEY = "cv-drafter-sidebar-collapsed";

function NavIcon({ name }: { name: "home" | "new" | "settings" | "signout" }) {
  const className = "h-[1.125rem] w-[1.125rem] shrink-0";
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 20 20" className={className} aria-hidden>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.5 8.5 10 3l6.5 5.5V16a1 1 0 0 1-1 1h-4v-5H8.5v5h-4a1 1 0 0 1-1-1V8.5Z"
          />
        </svg>
      );
    case "new":
      return (
        <svg viewBox="0 0 20 20" className={className} aria-hidden>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            d="M10 4v12M4 10h12"
          />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 20 20" className={className} aria-hidden>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm6.2-2.5 1.3.2a1 1 0 0 1 .8 1.2l-.2 1.3a1 1 0 0 0 .4.9l1.1 1a1 1 0 0 1 0 1.4l-1.1 1a1 1 0 0 0-.4.9l.2 1.3a1 1 0 0 1-1.2.8l-1.3-.2a1 1 0 0 0-.9.4l-1 1.1a1 1 0 0 1-1.4 0l-1-1.1a1 1 0 0 0-.9-.4l-1.3.2a1 1 0 0 1-1.2-.8l.2-1.3a1 1 0 0 0-.4-.9l-1.1-1a1 1 0 0 1 0-1.4l1.1-1a1 1 0 0 0 .4-.9l-.2-1.3a1 1 0 0 1 1.2-.8l1.3.2a1 1 0 0 0 .9-.4l1-1.1a1 1 0 0 1 1.4 0l1 1.1a1 1 0 0 0 .9.4Z"
          />
        </svg>
      );
    case "signout":
      return (
        <svg viewBox="0 0 20 20" className={className} aria-hidden>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 17H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3M13 14l4-3-4-3M8 11h8"
          />
        </svg>
      );
  }
}

export function AppShell() {
  const { signOut } = useAuth();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isNewSession = location.pathname === "/sessions/new";
  const isSessionWorkspace = /^\/sessions\/[^/]+$/.test(location.pathname);
  const showSidebarSessions = isNewSession || isSessionWorkspace;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => !c);
  }, []);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    clsx("app-shell-nav-link", isActive && "app-shell-nav-link--active");

  return (
    <div
      className={clsx(
        "app-shell flex min-h-screen",
        sidebarCollapsed && "app-shell--sidebar-collapsed",
        "app-shell--session",
      )}
    >
      <aside className="app-shell-sidebar" aria-label="Main navigation">
        <div className="app-shell-sidebar-head">
          <div className="app-shell-sidebar-brand min-w-0">
            <div className="app-shell-sidebar-eyebrow truncate">{APP_NAME}</div>
            <div className="app-shell-sidebar-title truncate">Workspace</div>
          </div>
          <button
            type="button"
            className="app-shell-sidebar-toggle"
            onClick={toggleSidebar}
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                d={sidebarCollapsed ? "M7 5l5 5-5 5" : "M13 5l-5 5 5 5"}
              />
            </svg>
          </button>
        </div>

        <CreditBalance collapsed={sidebarCollapsed} className="app-shell-credit-balance" />

        <nav className="app-shell-sidebar-nav">
          <NavLink to="/" end className={navClass} title="Home">
            <NavIcon name="home" />
            <span className="app-shell-nav-label">Home</span>
          </NavLink>
          <NavLink to="/sessions/new" end className={navClass} title="New reformat">
            <NavIcon name="new" />
            <span className="app-shell-nav-label">New reformat</span>
          </NavLink>
          <NavLink to="/settings" className={navClass} title="Settings & health">
            <NavIcon name="settings" />
            <span className="app-shell-nav-label">Settings & health</span>
          </NavLink>
        </nav>

        {showSidebarSessions ? (
          <SidebarSessionList collapsed={sidebarCollapsed} />
        ) : (
          <div className="app-shell-sidebar-spacer" aria-hidden />
        )}

        <div className="app-shell-sidebar-foot">
          <button
            type="button"
            className="app-shell-nav-link app-shell-signout"
            title="Sign out"
            aria-label="Sign out"
            onClick={() => void signOut()}
          >
            <NavIcon name="signout" />
            <span className="app-shell-nav-label">Sign out</span>
          </button>
        </div>
      </aside>

      <main
        className={clsx(
          "app-shell-main min-w-0 flex-1 bg-[var(--color-bg)]",
          isNewSession
            ? "flex min-h-screen flex-col overflow-y-auto px-4 py-6 sm:px-8 sm:py-8 lg:px-10"
            : "flex min-h-screen flex-col overflow-y-auto px-4 py-8 sm:px-8",
        )}
      >
        <div
          className={clsx(
            isNewSession
              ? "mx-auto w-full min-w-0 max-w-[68rem]"
              : isSessionWorkspace
                ? "mx-auto w-full min-w-0 max-w-[50rem] px-2 py-2 sm:px-5"
                : isHome
                  ? "mx-auto w-full min-w-0 max-w-[56rem] px-2 py-2 sm:px-5"
                  : "mx-auto w-full min-w-0 max-w-[50rem] px-2 py-2 sm:px-5",
          )}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
