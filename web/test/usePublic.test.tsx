import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePublicContent, usePublicPosts } from "../src/hooks/usePublic";
import type { ReactNode } from "react";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
beforeEach(() => vi.restoreAllMocks());

describe("public hooks", () => {
  it("content is fetched unauthenticated and without includeHidden", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ profile: { name: "D" }, experience: [], education: [], skills: [], projects: [] }));
    const { result } = renderHook(() => usePublicContent(), { wrapper: wrap });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe("/api/content");
    expect((init?.headers as Record<string, string> | undefined)?.authorization).toBeUndefined();
  });
  it("posts paginate with the cursor", async () => {
    const spy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ items: [{ slug: "b" }], cursor: "CUR" }))
      .mockResolvedValueOnce(json({ items: [{ slug: "a" }], cursor: null }));
    const { result } = renderHook(() => usePublicPosts(1), { wrapper: wrap });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages.length).toBe(2));
    expect(String(spy.mock.calls[1][0])).toBe("/api/posts?limit=1&cursor=CUR");
    expect(result.current.hasNextPage).toBe(false);
  });
});
