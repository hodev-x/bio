import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { startAuthentication } from "@simplewebauthn/browser";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";

// Injectable so tests don't need a real authenticator.
const defaultAuthenticate = (optionsJSON: unknown) =>
  startAuthentication({ optionsJSON: optionsJSON as Parameters<typeof startAuthentication>[0]["optionsJSON"] });

export function LoginPage({ authenticate = defaultAuthenticate }: { authenticate?: (o: unknown) => Promise<unknown> }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");

  const finish = (token: string) => { signIn(token); navigate("/admin"); };
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : "something went wrong");

  const passkey = async () => {
    setError(null); setBusy(true);
    try {
      const options = await api<unknown>("/api/auth/login/options", { method: "POST" });
      const assertion = await authenticate(options);
      const { accessToken } = await api<{ accessToken: string }>("/api/auth/login/verify", { method: "POST", body: assertion });
      finish(accessToken);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const recover = async () => {
    setError(null); setBusy(true);
    try {
      const { accessToken } = await api<{ accessToken: string }>("/api/auth/recovery", { method: "POST", body: { code } });
      finish(accessToken);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <main style={{ maxWidth: "22rem", margin: "15vh auto", padding: "0 1rem" }}>
      <h1>Admin login</h1>
      {error && <p className="error-banner">{error}</p>}
      <button className="btn" disabled={busy} onClick={() => void passkey()}>Sign in with passkey</button>
      <details style={{ marginTop: "1.5rem" }}>
        <summary>Use a recovery code</summary>
        <label className="field">
          <span>Recovery code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <button className="btn btn-secondary" disabled={busy || !code} onClick={() => void recover()}>Recover</button>
      </details>
      <p><Link to="/admin/register">First time? Register a passkey</Link></p>
    </main>
  );
}
