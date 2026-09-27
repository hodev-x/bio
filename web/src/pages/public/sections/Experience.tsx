import { TechChips } from "../../../components/TechChips";
import { fmtRange, type Item } from "../../../hooks/usePublic";

export function Experience({ items }: { items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <section id="experience">
      <p className="label">Experience</p>
      <ul className="timeline">
        {items.map((e) => (
          <li key={String(e.id)}>
            <span className="when">{fmtRange(String(e.startDate), e.endDate as string | undefined)}</span>
            <div className="what">
              <strong>{String(e.role)}</strong> <span className="meta">{String(e.company)}</span>
              {Array.isArray(e.highlights) && e.highlights.length > 0 && <ul>{(e.highlights as string[]).map((h) => <li key={h}>{h}</li>)}</ul>}
              <TechChips tech={e.tech as Record<string, unknown> | undefined} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
