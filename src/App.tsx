import { Component, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { NewSessionPage } from "./pages/NewSessionPage";
import { SessionWorkspacePage } from "./pages/SessionWorkspacePage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignupPage } from "./pages/SignupPage";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { crashed: boolean; message: string }
> {
  state = { crashed: false, message: "" };

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { crashed: true, message };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("[ErrorBoundary] Render crash:", error, info);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-8 text-center">
          <p className="text-lg font-semibold text-[var(--color-text)]">Something went wrong.</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            An unexpected error occurred. Your session data is safe.
          </p>
          {this.state.message && (
            <pre className="max-w-lg rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-left text-xs text-red-300 whitespace-pre-wrap">
              {this.state.message}
            </pre>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 rounded-xl bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function RequireAuth() {
  const { loading, accessToken } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--color-text-muted)]">
        Loading session…
      </div>
    );
  }

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route index element={<HomePage />} />
                <Route path="sessions/new" element={<NewSessionPage />} />
                <Route path="sessions/:sessionId" element={<SessionWorkspacePage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
