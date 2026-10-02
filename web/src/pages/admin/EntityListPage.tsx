import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useContent, invalidateContent, type Item } from "../../hooks/useContent";
import { saveEntity, deleteEntity, toggleVisible } from "../../api/mutations";
import { ArrayField, RecordField } from "../../components/ArrayField";
import { FormErrors } from "../../components/EntityForm";
import type { EntityConfig } from "./entityConfigs";

type FormValues = Record<string, unknown>;

// Empty string -> undefined so optional zod validators (isoDate/url) don't choke
// on a blank <input>; required fields still fail zod with "Required" on undefined,
// which is the same UX as the min-1 message.
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

export function EntityListPage({ config }: { config: EntityConfig }) {
  const { data, isPending } = useContent();
  const qc = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null); // null = create mode
  const [serverError, setServerError] = useState<unknown>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(config.schema), defaultValues: { visible: true } });

  if (isPending) return <p>Loading…</p>;
  const items = (data?.[config.type] ?? []) as Item[];

  const startEdit = (item: Item) => {
    setEditingKey(String(item[config.keyAttr]));
    form.reset(item as FormValues);
    setServerError(null);
  };
  const startNew = () => { setEditingKey(null); form.reset({ visible: true }); setServerError(null); };

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await saveEntity(config.type, String(values[config.keyAttr]), values);
      await invalidateContent(qc);
      startNew();
    } catch (e) { setServerError(e); }
  });

  const doToggle = async (item: Item) => {
    await toggleVisible(config.type, String(item[config.keyAttr]), item.visible === false);
    await invalidateContent(qc);
  };
  const doDelete = async (item: Item) => {
    if (!window.confirm(`Delete ${item[config.titleAttr] ?? item[config.keyAttr]}?`)) return;
    await deleteEntity(config.type, String(item[config.keyAttr]));
    await invalidateContent(qc);
    if (editingKey === String(item[config.keyAttr])) startNew();
  };

  const err = form.formState.errors;
  return (
    <>
      <h1 style={{ textTransform: "capitalize" }}>{config.type}</h1>
      <table className="table">
        <tbody>
          {items.map((item) => {
            const key = String(item[config.keyAttr]);
            return (
              <tr key={key}>
                <td>{String(item[config.titleAttr] ?? key)}</td>
                <td><code>{config.keyAttr}: {key}</code></td>
                <td>{item.visible === false && <span className="badge badge-hidden">hidden</span>}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-secondary" onClick={() => startEdit(item)}>Edit</button>{" "}
                  <button className="btn btn-secondary" onClick={() => void doToggle(item)}>{item.visible === false ? "Show" : "Hide"}</button>{" "}
                  <button className="btn btn-danger" onClick={() => void doDelete(item)}>Delete</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2>{editingKey ? `Edit ${editingKey}` : "New item"}</h2>
        <FormErrors error={serverError} />
        <form onSubmit={(e) => void onSubmit(e)}>
          <label className="field"><span>{config.keyAttr}</span>
            <input {...form.register(config.keyAttr)} disabled={editingKey !== null} />
            {err[config.keyAttr] && <p className="field-error">{String(err[config.keyAttr]?.message)}</p>}
          </label>
          {config.fields.map((f) => {
            if (f.kind === "array") {
              return <Controller key={f.name} control={form.control} name={f.name}
                render={({ field }) => <ArrayField label={f.label} values={(field.value ?? []) as string[]} onChange={field.onChange} />} />;
            }
            if (f.kind === "record") {
              return <Controller key={f.name} control={form.control} name={f.name}
                render={({ field }) => <RecordField label={f.label} value={(field.value ?? {}) as Record<string, unknown>} onChange={field.onChange} />} />;
            }
            if (f.kind === "number") {
              return (
                <label key={f.name} className="field"><span>{f.label}</span>
                  <input type="number" min={0} step={1}
                    {...form.register(f.name, { setValueAs: (v: unknown) => (v === "" || v == null ? undefined : Number(v)) })} />
                  {err[f.name] && <p className="field-error">{String(err[f.name]?.message)}</p>}
                </label>
              );
            }
            return (
              <label key={f.name} className="field"><span>{f.label}</span>
                {f.kind === "textarea"
                  ? <textarea rows={4} {...form.register(f.name, { setValueAs: emptyToUndefined })} />
                  : <input {...form.register(f.name, { setValueAs: emptyToUndefined })} />}
                {err[f.name] && <p className="field-error">{String(err[f.name]?.message)}</p>}
              </label>
            );
          })}
          <label className="field"><span>Visible</span><input type="checkbox" {...form.register("visible")} style={{ width: "auto" }} /></label>
          <button className="btn" type="submit" disabled={form.formState.isSubmitting}>Save</button>{" "}
          {editingKey && <button className="btn btn-secondary" type="button" onClick={startNew}>Cancel</button>}
        </form>
      </div>
    </>
  );
}
