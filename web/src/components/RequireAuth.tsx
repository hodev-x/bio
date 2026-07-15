import { Navigate } from "react-router";
import type { ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <p>Checking session…</p>;
  if (status === "anon") return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}
