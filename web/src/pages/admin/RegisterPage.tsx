import { useState } from "react";
import { Link } from "react-router";
import { startRegistration } from "@simplewebauthn/browser";
import { api, ApiError } from "../../api/client";

const defaultRegister = (optionsJSON: unknown) =>
  startRegistration({ optionsJSON: optionsJSON as Parameters<typeof startRegistration>[0]["optionsJSON"] });

export function RegisterPage({ register = defaultRegister }: { register?: (o: unknown) => Promise<unknown> }) {
  const [token, setToken] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setError(null); setBusy(true);
    try {
      const options = await api<unknown>("/api/auth/register/options", { method: "POST", body: { bootstrapToken: token } });
      const attestation = await register(options);
      const out = await api<{ verified: boolean; recoveryCodes: string[] }>("/api/auth/register/verify", { method: "POST", body: attestation });
      setCodes(out.recoveryCodes);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "something went wrong");
    } finally { setBusy(false); }
  };

  if (codes) {
    return (
      <main style={{ maxWidth: "26rem", margin: "10vh auto", padding: "0 1rem" }}>
        <h1>Save your recovery codes</h1>
        <p>These are shown <strong>once</strong>. They are the only way in if you lose your passkey.</p>
        <pre className="card">{codes.join("\n")}</pre>
        <button className="btn btn-secondary" onClick={() => void navigator.clipboard.writeText(codes.join("\n"))}>Copy</button>{" "}
        {!saved
          ? <button className="btn" onClick={() => setSaved(true)}>I saved my recovery codes</button>
          : <Link to="/admin/login">Go to login</Link>}
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "22rem", margin: "15vh auto", padding: "0 1rem" }}>
      <h1>Register the first passkey</h1>
      {error && <p className="error-banner">{error}</p>}
      <label className="field">
        <span>Bootstrap token</span>
        <input value={token} onChange={(e) => setToken(e.target.value)} />
      </label>
      <button className="btn" disabled={busy || !token} onClick={() => void run()}>Create passkey</button>
      <p><Link to="/admin/login">Back to login</Link></p>
    </main>
  );
}
