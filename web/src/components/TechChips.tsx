import { useMode } from "../mode/ModeContext";

const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "object" && v ? JSON.stringify(v) : String(v));

export function TechChips({ tech }: { tech?: Record<string, unknown> }) {
  const { dev } = useMode();
  if (!dev || !tech || Object.keys(tech).length === 0) return null;
  return (
    <ul className="tech">
      {Object.entries(tech).map(([k, v]) => <li key={k}><span className="tech-k">{k}</span> {show(v)}</li>)}
    </ul>
  );
}
