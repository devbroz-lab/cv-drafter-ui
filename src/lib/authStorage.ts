export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

const ACCESS_KEY = "cvdrafterui:accessToken";
const REFRESH_KEY = "cvdrafterui:refreshToken";
const USER_KEY = "cvdrafterui:user";

export function getStoredSession(): AuthSession | null {
  const accessToken = localStorage.getItem(ACCESS_KEY);
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  const userRaw = localStorage.getItem(USER_KEY);
  if (!accessToken || !refreshToken || !userRaw) return null;
  try {
    const user = JSON.parse(userRaw) as AuthUser;
    if (!user?.id || !user?.email) return null;
    return { accessToken, refreshToken, user };
  } catch {
    return null;
  }
}

export function setStoredSession(session: AuthSession): void {
  localStorage.setItem(ACCESS_KEY, session.accessToken);
  localStorage.setItem(REFRESH_KEY, session.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  window.dispatchEvent(new Event("auth:changed"));
}

export function clearStoredSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event("auth:changed"));
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser(): AuthUser | null {
  const userRaw = localStorage.getItem(USER_KEY);
  if (!userRaw) return null;
  try {
    const user = JSON.parse(userRaw) as AuthUser;
    if (!user?.id || !user?.email) return null;
    return user;
  } catch {
    return null;
  }
}
