import { NavLink, Outlet } from "react-router-dom";

import clsx from "clsx";

import { useAuth } from "../contexts/AuthContext";

import { Button } from "./ui";

const navClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    "block rounded-lg px-3 py-2 text-sm transition-colors",
    isActive ? "bg-[var(--color-surface-muted)] text-[var(--color-text)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
  );

export function AppShell() {
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] px-4 py-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            CV Reformatter
          </div>
          <div className="mt-1 text-lg font-medium text-[var(--color-text)]">Workspace</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          <NavLink to="/" end className={navClass}>
            Home
          </NavLink>
          <NavLink to="/sessions/new" className={navClass}>
            New reformat
          </NavLink>
          <NavLink to="/settings" className={navClass}>
            Settings & health
          </NavLink>
        </nav>
        <div className="border-t border-[var(--color-border)] p-3">
          <Button variant="ghost" className="w-full justify-start" type="button" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 bg-[var(--color-bg)] p-8">
        <div className="mx-auto max-w-3xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
