import { Link } from "react-router";
import { Meta } from "../../components/Meta";
import { fmtDate, usePublicPosts } from "../../hooks/usePublic";

export function BlogList() {
  const q = usePublicPosts(10);
  const meta = <Meta title="Writing — Daniel Hodeta" description="Notes and learnings by Daniel Hodeta." />;
  if (q.isPending) return <div aria-busy="true">{meta}<div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>;
  if (q.isError) return <div className="error">{meta}<p>Couldn't load the posts.</p><button type="button" onClick={() => void q.refetch()}>Retry</button></div>;
  const items = q.data.pages.flatMap((p) => p.items);
  return (
    <div>
      {meta}
      <h1>Writing</h1>
      {items.map((p) => (
        <article key={String(p.slug)}>
          <h2><Link to={`/blog/${String(p.slug)}`}>{String(p.title)}</Link></h2>
          {typeof p.publishedAt === "string" && <span className="meta">{fmtDate(p.publishedAt)}</span>}
          {Array.isArray(p.tags) && p.tags.map((tag) => <span key={String(tag)} className="meta">{String(tag)}</span>)}
        </article>
      ))}
      {q.hasNextPage && (
        <button type="button" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          Load more
        </button>
      )}
    </div>
  );
}
