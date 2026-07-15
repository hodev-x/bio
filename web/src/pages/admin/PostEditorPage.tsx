import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { PostSchema, PostPutSchema, type Post } from "@bio/shared";
import { api } from "../../api/client";
import { saveEntity, createPostApi } from "../../api/mutations";
import { invalidatePosts } from "../../hooks/useContent";
import { ArrayField } from "../../components/ArrayField";
import { FormErrors } from "../../components/EntityForm";
import { Markdown } from "../../components/Markdown";

export function PostEditorPage({ mode }: { mode: "create" | "edit" }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(mode === "edit");
  // A failed edit-mode load leaves a near-empty form; block Save so a stray
  // submit can't full-replace (PUT) the real post with blanks.
  const [loadFailed, setLoadFailed] = useState(false);
  const form = useForm<Post>({
    resolver: zodResolver(mode === "create" ? PostSchema : PostPutSchema),
    defaultValues: { slug: "", title: "", body: "", tags: [], visible: true },
  });

  useEffect(() => {
    if (mode === "edit" && slug) {
      api<Post>(`/api/posts/${slug}`, { auth: true })
        .then((post) => form.reset(post))
        .catch((e: unknown) => { setServerError(e); setLoadFailed(true); })
        .finally(() => setLoading(false));
    }
  }, [mode, slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null); setSaved(false);
    try {
      if (mode === "create") {
        await createPostApi(values);
        await invalidatePosts(qc);
        navigate(`/admin/posts/${values.slug}`);
      } else {
        await saveEntity("posts", slug!, values);
        await invalidatePosts(qc);
        setSaved(true);
      }
    } catch (e) { setServerError(e); }
  });

  const err = form.formState.errors;
  const body = form.watch("body");
  if (loading) return <p>Loading…</p>;
  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <h1>{mode === "create" ? "New post" : `Edit: ${slug}`}</h1>
      <FormErrors error={serverError} />
      {saved && <p className="card">Saved.</p>}
      <label className="field"><span>Title</span><input {...form.register("title")} />
        {err.title && <p className="field-error">{err.title.message}</p>}</label>
      <label className="field"><span>Slug</span><input {...form.register("slug")} disabled={mode === "edit"} />
        {err.slug && <p className="field-error">{err.slug.message}</p>}</label>
      <Controller control={form.control} name="tags"
        render={({ field }) => <ArrayField label="Tags" values={(field.value ?? []) as string[]} onChange={field.onChange} />} />
      <label className="field"><span>Published at (ISO; blank on create = now)</span>
        <input {...form.register("publishedAt", { setValueAs: (v: string) => (v === "" ? undefined : v) })} />
        {err.publishedAt && <p className="field-error">{err.publishedAt.message}</p>}</label>
      <label className="field"><span>Visible</span><input type="checkbox" {...form.register("visible")} style={{ width: "auto" }} /></label>
      <div className="split-pane">
        <label className="field"><span>Body (markdown)</span><textarea {...form.register("body")} />
          {err.body && <p className="field-error">{err.body.message}</p>}</label>
        <div className="card"><Markdown source={body ?? ""} /></div>
      </div>
      <button className="btn" type="submit" disabled={form.formState.isSubmitting || loadFailed}>Save</button>
    </form>
  );
}
