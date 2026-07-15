import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { usePosts, invalidatePosts, type Item } from "../../hooks/useContent";
import { deleteEntity, toggleVisible } from "../../api/mutations";

export function PostsPage() {
  const { data, isPending } = usePosts();
  const qc = useQueryClient();
  if (isPending) return <p>Loading…</p>;
  const posts = data?.items ?? [];

  const doToggle = async (p: Item) => { await toggleVisible("posts", String(p.slug), p.visible === false); await invalidatePosts(qc); };
  const doDelete = async (p: Item) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    await deleteEntity("posts", String(p.slug));
    await invalidatePosts(qc);
  };

  return (
    <>
      <h1>Posts <Link className="btn" style={{ float: "right" }} to="/admin/posts/new">New post</Link></h1>
      <table className="table">
        <tbody>
          {posts.map((p) => (
            <tr key={String(p.slug)}>
              <td><Link to={`/admin/posts/${String(p.slug)}`}>{String(p.title)}</Link></td>
              <td><code>{String(p.slug)}</code></td>
              <td>{String(p.publishedAt ?? "").slice(0, 10)}</td>
              <td>{p.visible === false && <span className="badge badge-hidden">hidden</span>}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-secondary" onClick={() => void doToggle(p)}>{p.visible === false ? "Show" : "Hide"}</button>{" "}
                <button className="btn btn-danger" onClick={() => void doDelete(p)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
