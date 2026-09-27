import { Link } from "react-router";
import { fmtDate, usePublicPosts } from "../../../hooks/usePublic";

export function LatestPosts() {
  const q = usePublicPosts(3);
  const items = q.data?.pages[0]?.items ?? [];
  if (q.isError || items.length === 0) return null;
  return (
    <section id="writing">
      <p className="label">Writing</p>
      <ul className="list">
        {items.map((p) => (
          <li key={String(p.slug)}>
            <Link to={`/blog/${String(p.slug)}`}>{String(p.title)}</Link>{" "}
            {typeof p.publishedAt === "string" && <span className="meta">{fmtDate(p.publishedAt)}</span>}
          </li>
        ))}
      </ul>
      <Link to="/blog">All writing →</Link>
    </section>
  );
}
