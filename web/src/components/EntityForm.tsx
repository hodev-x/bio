import { ApiError } from "../api/client";

export function FormErrors({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof ApiError && error.issues) {
    return (
      <div className="error-banner">
        {Object.entries(error.issues).map(([field, msgs]) => <p key={field} style={{ margin: 0 }}>{field}: {msgs.join(", ")}</p>)}
      </div>
    );
  }
  return <p className="error-banner">{error instanceof Error ? error.message : "something went wrong"}</p>;
}
