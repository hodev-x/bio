import { TechChips } from "../../../components/TechChips";
import type { Item } from "../../../hooks/usePublic";
import { appPathOf } from "../../../apps";

export function Projects({ items }: { items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <section id="projects">
      <p className="label">Projects</p>
      <ul className="list">
        {items.map((p) => {
          const appPath = appPathOf(p);
          return (
            <li key={String(p.id)}>
              <div className="what">
                <strong>
                  {p.repo ? <a href={String(p.repo)}>{String(p.title)}</a> : String(p.title)}
                </strong>{" "}
                {appPath && <><a href={appPath}>Open app</a>{" "}</>}
                {p.status != null && <span className="meta">{String(p.status)}</span>}
                {typeof p.desc === "string" && p.desc && <p>{p.desc}</p>}
                <TechChips tech={p.tech as Record<string, unknown> | undefined} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
