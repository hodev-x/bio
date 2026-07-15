import { Link } from "react-router";
import { useContent, usePosts, type Item } from "../../hooks/useContent";

const hiddenCount = (items: Item[]) => items.filter((i) => i.visible === false).length;

function Card({ name, items }: { name: string; items: Item[] }) {
  const hidden = hiddenCount(items);
  return (
    <div className="card" data-testid={`card-${name}`}>
      <h2 style={{ margin: "0 0 .3rem", textTransform: "capitalize" }}><Link to={`/admin/${name}`}>{name}</Link></h2>
      <p style={{ margin: 0 }}>
        {items.length} item{items.length === 1 ? "" : "s"}
        {hidden > 0 && <> · <span className="badge badge-hidden">{hidden} hidden</span></>}
      </p>
    </div>
  );
}

export function Dashboard() {
  const content = useContent();
  const posts = usePosts();
  if (content.isPending || posts.isPending) return <p>Loading…</p>;
  if (content.isError || posts.isError) return <p className="error-banner">Failed to load content.</p>;
  const c = content.data;
  return (
    <>
      <h1>Dashboard</h1>
      <Card name="profile" items={c.profile ? [c.profile] : []} />
      <Card name="experience" items={c.experience} />
      <Card name="education" items={c.education} />
      <Card name="skills" items={c.skills} />
      <Card name="projects" items={c.projects} />
      <Card name="posts" items={posts.data.items} />
    </>
  );
}
