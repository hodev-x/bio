import { useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export type Item = Record<string, unknown> & { visible?: boolean };
export interface SiteContent {
  profile: Item | null;
  experience: Item[];
  education: Item[];
  skills: Item[];
  projects: Item[];
}

export const useContent = () =>
  useQuery({ queryKey: ["content"], queryFn: () => api<SiteContent>("/api/content?includeHidden=true", { auth: true }) });

export const usePosts = () =>
  useQuery({ queryKey: ["posts"], queryFn: () => api<{ items: Item[] }>("/api/posts?limit=100&includeHidden=true", { auth: true }) });

export const invalidateContent = (qc: QueryClient) => qc.invalidateQueries({ queryKey: ["content"] });
export const invalidatePosts = (qc: QueryClient) => qc.invalidateQueries({ queryKey: ["posts"] });
