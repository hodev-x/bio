import { useParams } from "react-router";
import { ApiError } from "../../api/client";
import { Markdown } from "../../components/Markdown";
import { Meta } from "../../components/Meta";
import { fmtDate, usePost } from "../../hooks/usePublic";
import { NotFound } from "./NotFound";

export function PostPage() {
  const { slug } = useParams();
  const q = usePost(slug ?? "");
  if (q.isPending) return <div aria-busy="true"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) return <NotFound />;
    return <div className="error"><p>Couldn't load the post.</p><button type="button" onClick={() => void q.refetch()}>Retry</button></div>;
  }
  const { title, body, publishedAt } = q.data;
  const excerpt = String(body).replace(/[#*_>`\[\]()!-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  return (
    <div>
      <Meta title={`${String(title)} — Daniel Hodeta`} description={excerpt} />
      <h1>{String(title)}</h1>
      {typeof publishedAt === "string" && <p className="meta">{fmtDate(publishedAt)}</p>}
      <div className="post-body"><Markdown source={String(body)} /></div>
    </div>
  );
}
