import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, onAuthLost, refreshSession, setAccessToken, subOf } from "../api/client";

type Status = "loading" | "authed" | "anon";
interface AuthState { status: Status; sub: string | null; signIn: (token: string) => void; signOut: () => Promise<void> }

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [sub, setSub] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    let live = true;
    refreshSession()
      .then((session) => {
        if (!live) return;
        setSub(session?.sub ?? null);
        setStatus(session ? "authed" : "anon");
      })
      .catch(() => {
        if (!live) return;
        setSub(null);
        setStatus("anon");
      });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    onAuthLost(() => {
      setAccessToken(null);
      setSub(null);
      setStatus("anon");
    });
    return () => onAuthLost(null);
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
    qc.clear();
  };

  return <AuthCtx.Provider value={{ status, sub, signIn, signOut }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
