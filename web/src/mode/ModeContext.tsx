import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const KEY = "bio:mode";
type Mode = { dev: boolean; toggle: () => void };
const Ctx = createContext<Mode | null>(null);

const read = (): boolean => { try { return localStorage.getItem(KEY) === "dev"; } catch { return false; } };

// Dev mode is presentation only (parent spec §5): it reveals the public
// `tech.*` payload inline. Not auth, not privacy.
export function ModeProvider({ children }: { children: ReactNode }) {
  const [dev, setDev] = useState(read);
  useEffect(() => {
    document.body.classList.toggle("mode-dev", dev);
    try { localStorage.setItem(KEY, dev ? "dev" : "default"); } catch { /* storage unavailable */ }
  }, [dev]);
  return <Ctx.Provider value={{ dev, toggle: () => setDev((d) => !d) }}>{children}</Ctx.Provider>;
}

export function useMode(): Mode {
  const m = useContext(Ctx);
  if (!m) throw new Error("useMode outside ModeProvider");
  return m;
}
