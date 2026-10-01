import { useEffect, useState } from "react";

interface ArrayFieldProps { label: string; values: string[]; onChange: (next: string[]) => void }

export function ArrayField({ label, values, onChange }: ArrayFieldProps) {
  return (
    <div className="field">
      <span>{label}</span>
      {values.map((v, i) => (
        <div key={i} style={{ display: "flex", gap: ".4rem", marginBottom: ".3rem" }}>
          <input aria-label={`${label} ${i + 1}`} value={v}
            onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" className="btn btn-secondary" onClick={() => onChange(values.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" onClick={() => onChange([...values, ""])}>+ add</button>
    </div>
  );
}

interface RecordFieldProps { label: string; value: Record<string, unknown>; onChange: (next: Record<string, unknown>) => void }

const toText = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));

const fromText = (text: string): unknown => {
  const t = text.trim();
  if (t.startsWith("[") || t.startsWith("{")) {
    try { return JSON.parse(t); } catch { /* keep the string */ }
  }
  return text;
};

const toRows = (value: Record<string, unknown>): [string, string][] =>
  Object.entries(value).map(([k, v]) => [k, toText(v)]);

const toRecord = (rows: [string, string][]): Record<string, unknown> =>
  Object.fromEntries(rows.filter(([k]) => k !== "").map(([k, v]) => [k, fromText(v)]));

export function RecordField({ label, value, onChange }: RecordFieldProps) {
  // Rows are internal state so empty-key rows (freshly added, or a key cleared
  // mid-edit) stay visible and editable; only non-empty keys are emitted.
  const [rows, setRows] = useState<[string, string][]>(() => toRows(value));

  // Resync from the parent (e.g. form.reset after content loads) only when the
  // incoming value differs from what we last emitted — otherwise our own echo
  // would wipe in-progress empty-key rows.
  useEffect(() => {
    if (JSON.stringify(toRecord(rows)) !== JSON.stringify(value)) setRows(toRows(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next: [string, string][]) => {
    setRows(next);
    onChange(toRecord(next));
  };
  return (
    <div className="field">
      <span>{label}</span>
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: "flex", gap: ".4rem", marginBottom: ".3rem" }}>
          <input aria-label={`${label} key ${i + 1}`} value={k}
            onChange={(e) => update(rows.map((kv, j) => (j === i ? [e.target.value, kv[1]] : kv)) as [string, string][])} />
          <input aria-label={`${label} value ${i + 1}`} value={v}
            onChange={(e) => update(rows.map((kv, j) => (j === i ? [kv[0], e.target.value] : kv)) as [string, string][])} />
          <button type="button" className="btn btn-secondary" onClick={() => update(rows.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" onClick={() => update([...rows, ["", ""]])}>+ add</button>
    </div>
  );
}
