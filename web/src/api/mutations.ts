import { api } from "./client";

export const saveEntity = (type: string, key: string | null, data: unknown) =>
  api(key === null ? `/api/${type}` : `/api/${type}/${encodeURIComponent(key)}`, { method: "PUT", auth: true, body: data });

export const deleteEntity = (type: string, key: string) =>
  api(`/api/${type}/${encodeURIComponent(key)}`, { method: "DELETE", auth: true });

export const toggleVisible = (type: string, key: string, visible: boolean) =>
  api(`/api/${type}/${encodeURIComponent(key)}`, { method: "PATCH", auth: true, body: { visible } });

export const createPostApi = (data: unknown) => api("/api/posts", { method: "POST", auth: true, body: data });
