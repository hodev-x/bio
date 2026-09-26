import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Item, SiteContent } from "./useContent";

export type { Item, SiteContent };
export type PostPage = { items: Item[]; cursor: string | null };

export const usePublicContent = () =>
  useQuery({ queryKey: ["public", "content"], queryFn: () => api<SiteContent>("/api/content"), retry: false });

export const usePublicPosts = (limit = 10) =>
  useInfiniteQuery({
    queryKey: ["public", "posts", limit],
    queryFn: ({ pageParam }) =>
      api<PostPage>(`/api/posts?limit=${limit}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.cursor,
  });

export const usePost = (slug: string) =>
  useQuery({ queryKey: ["public", "post", slug], queryFn: () => api<Item>(`/api/posts/${encodeURIComponent(slug)}`), retry: false });

export const fmtRange = (start: string, end?: string) => `${start} – ${end ?? "now"}`;
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
