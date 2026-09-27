import type { Item } from "../../../hooks/usePublic";

export function Skills({ items }: { items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <section id="skills">
      <p className="label">Skills</p>
      <dl className="skills">
        {items.map((s) => (
          <div key={String(s.category)}>
            <dt>{String(s.category)}</dt>
            <dd>{Array.isArray(s.items) ? (s.items as string[]).join(", ") : ""}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
