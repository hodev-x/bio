import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ProfileSchema, type Profile } from "@bio/shared";
import { useContent, invalidateContent } from "../../hooks/useContent";
import { saveEntity } from "../../api/mutations";
import { RecordField } from "../../components/ArrayField";
import { FormErrors } from "../../components/EntityForm";

export function ProfilePage() {
  const { data, isPending } = useContent();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<Profile>({ resolver: zodResolver(ProfileSchema), defaultValues: { id: "me", name: "", tagline: "", socials: {}, visible: true } });

  useEffect(() => {
    if (data?.profile) form.reset(data.profile as Profile);
  }, [data?.profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null); setSaved(false);
    try {
      await saveEntity("profile", null, values);
      await invalidateContent(qc);
      setSaved(true);
    } catch (e) { setServerError(e); }
  });

  if (isPending) return <p>Loading…</p>;
  const err = form.formState.errors;
  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <h1>Profile</h1>
      <FormErrors error={serverError} />
      {saved && <p className="card">Saved.</p>}
      <label className="field"><span>Name</span><input {...form.register("name")} />
        {err.name && <p className="field-error">{err.name.message}</p>}</label>
      <label className="field"><span>Tagline</span><input {...form.register("tagline")} />
        {err.tagline && <p className="field-error">{err.tagline.message}</p>}</label>
      <label className="field"><span>About</span><textarea rows={5} {...form.register("about")} /></label>
      <Controller control={form.control} name="socials"
        render={({ field }) => <RecordField label="Socials (name → URL)" value={(field.value ?? {}) as Record<string, string>} onChange={field.onChange} />} />
      {err.socials && <p className="field-error">socials: every value must be a URL</p>}
      <label className="field"><span>Visible</span><input type="checkbox" {...form.register("visible")} style={{ width: "auto" }} /></label>
      <button className="btn" type="submit" disabled={form.formState.isSubmitting}>Save</button>
    </form>
  );
}
