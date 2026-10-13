import { Meta } from "../../components/Meta";
import { usePublicContent } from "../../hooks/usePublic";
import { appPathOf, appsOf } from "../../apps";

export function AppsPage() {
  const q = usePublicContent();
  const meta = <Meta title="Apps — Daniel Hodeta" description="Apps built by Daniel Hodeta." />;
  if (q.isPending) return <div aria-busy="true">{meta}<div className="skeleton" /><div className="skeleton" /></div>;
  if (q.isError) return <div className="error">{meta}<p>Couldn't load the apps.</p><button type="button" onClick={() => void q.refetch()}>Retry</button></div>;
  const apps = appsOf(q.data.projects);
  return (
    <div>
      {meta}
      <h1>Apps</h1>
      {apps.length === 0 ? (
        <p>No apps yet.</p>
      ) : (
        <ul className="list">
          {apps.map((p) => (
            <li key={String(p.id)}>
              <strong>{String(p.title)}</strong>{" "}
              <span className="meta">{String(p.status)}</span>
              {typeof p.desc === "string" && p.desc && <p>{p.desc}</p>}
              <a href={appPathOf(p)} aria-label={`Open ${String(p.title)}`}>Open</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
