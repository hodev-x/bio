import { fmtRange, type Item } from "../../../hooks/usePublic";

export function Education({ items }: { items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <section id="education">
      <p className="label">Education</p>
      <ul className="timeline">
        {items.map((e) => (
          <li key={String(e.id)}>
            <span className="when">{fmtRange(String(e.startDate), e.endDate as string | undefined)}</span>
            <div className="what">
              <strong>{String(e.institution)}</strong> <span className="meta">{String(e.degree)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
