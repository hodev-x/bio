import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, refreshSession, setAccessToken } from "../api/client";

type Status = "loading" | "authed" | "anon";
interface AuthState { status: Status; sub: string | null; signIn: (token: string) => void; signOut: () => Promise<void> }

const AuthCtx = createContext<AuthState | null>(null);

const subOf = (token: string): string =>
  (JSON.parse(atob(token.split(".")[1])) as { sub: string }).sub;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [sub, setSub] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void refreshSession().then((session) => {
      if (!live) return;
      setSub(session?.sub ?? null);
      setStatus(session ? "authed" : "anon");
    });
    return () => { live = false; };
  }, []);

  const signIn = (token: string) => {
    setAccessToken(token);
    setSub(subOf(token));
    setStatus("authed");
  };

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setAccessToken(null);
    setSub(null);
    setStatus("anon");
  };

  return <AuthCtx.Provider value={{ status, sub, signIn, signOut }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
