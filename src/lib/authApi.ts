import {
  clearStoredSession,
  getStoredRefreshToken,
  getStoredUser,
  setStoredSession,
  type AuthSession,
} from "./authStorage";

const AUTH_BASE = () =>
  import.meta.env.VITE_AUTH_API_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000/auth";

type AuthPayload = {
  user: { id: string; email: string };
  accessToken: string;
  refreshToken: string;
};

type RefreshPayload = {
  accessToken: string;
};

async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const res = await fetch(`${AUTH_BASE()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as { detail?: string; message?: string };
  if (!res.ok) throw new Error(payload.detail || payload.message || `Auth error (${res.status})`);
  return payload as TResponse;
}

function toSession(payload: AuthPayload): AuthSession {
  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: payload.user,
  };
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const payload = await postJson<AuthPayload>("/login", { email, password });
  const session = toSession(payload);
  setStoredSession(session);
  return session;
}

export async function signup(email: string, password: string): Promise<AuthSession> {
  const payload = await postJson<AuthPayload>("/register", { email, password });
  const session = toSession(payload);
  setStoredSession(session);
  return session;
}

export async function loginWithGoogle(idToken: string): Promise<AuthSession> {
  const payload = await postJson<AuthPayload>("/google", { idToken });
  const session = toSession(payload);
  setStoredSession(session);
  return session;
}

export async function loginWithMicrosoft(idToken: string): Promise<AuthSession> {
  const payload = await postJson<AuthPayload>("/microsoft", { idToken });
  const session = toSession(payload);
  setStoredSession(session);
  return session;
}

export async function refreshAccessToken(): Promise<string> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    clearStoredSession();
    throw new Error("No refresh token available");
  }
  const payload = await postJson<RefreshPayload>("/refresh", { refreshToken });
  const current = getStoredUser();
  if (!current) {
    clearStoredSession();
    throw new Error("Session user missing");
  }
  const updated: AuthSession = { accessToken: payload.accessToken, refreshToken, user: current };
  setStoredSession(updated);
  return payload.accessToken;
}

export async function logout(): Promise<void> {
  const refreshToken = getStoredRefreshToken();
  if (refreshToken) {
    await postJson("/logout", { refreshToken }).catch(() => undefined);
  }
  clearStoredSession();
}
