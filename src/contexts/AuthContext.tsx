import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { login, loginWithGoogle, loginWithMicrosoft, logout, signup } from "../lib/authApi";
import { clearStoredSession, getStoredSession, type AuthSession, type AuthUser } from "../lib/authStorage";

type AuthState = {
  user: AuthUser | null;
  session: AuthSession | null;
  accessToken: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithMicrosoft: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sync = () => {
      const current = getStoredSession();
      setSession(current);
      setUser(current?.user ?? null);
      setLoading(false);
    };
    sync();
    window.addEventListener("auth:changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("auth:changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await login(email, password);
    setSession(next);
    setUser(next.user);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const next = await signup(email, password);
    setSession(next);
    setUser(next.user);
  }, []);

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const next = await loginWithGoogle(idToken);
    setSession(next);
    setUser(next.user);
  }, []);

  const signInWithMicrosoft = useCallback(async (idToken: string) => {
    const next = await loginWithMicrosoft(idToken);
    setSession(next);
    setUser(next.user);
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    clearStoredSession();
    setSession(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      accessToken: session?.accessToken ?? null,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithMicrosoft,
      signOut,
    }),
    [user, session, loading, signIn, signUp, signInWithGoogle, signInWithMicrosoft, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
