// Access token lives in module memory ONLY (never storage): XSS can't steal
// what isn't persisted, and the httpOnly refresh cookie restores sessions.
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

export class ApiError extends Error {
  status: number;
  issues?: Record<string, string[]>;
  constructor(status: number, message: string, issues?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

interface Opts { method?: string; body?: unknown; auth?: boolean }

async function rawFetch(path: string, opts: Opts): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.auth && accessToken) headers["authorization"] = `Bearer ${accessToken}`;
  return fetch(path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
}

async function toError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: Record<string, string[]> };
  return new ApiError(res.status, body.error ?? `request failed (${res.status})`, body.issues);
}

const subOf = (token: string): string =>
  (JSON.parse(atob(token.split(".")[1])) as { sub: string }).sub;

export async function refreshSession(): Promise<{ sub: string } | null> {
  const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
  if (!res.ok) return null;
  const { accessToken: token } = (await res.json()) as { accessToken: string };
  setAccessToken(token);
  return { sub: subOf(token) };
}

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  let res = await rawFetch(path, opts);
  if (res.status === 401 && opts.auth) {
    const refreshed = await refreshSession();
    if (!refreshed) {
      setAccessToken(null);
      throw await toError(res);
    }
    res = await rawFetch(path, opts);
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
