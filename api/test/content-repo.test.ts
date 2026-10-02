import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { getSiteContent, listPosts, getPost } from "../src/data/content.js";

const ddb = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddb.reset());

describe("getSiteContent", () => {
  it("aggregates visible items across tables and sorts experience by date desc", async () => {
    ddb.on(ScanCommand, { TableName: "bio-profile" }).resolves({ Items: [{ id: "me", name: "Daniel", visible: true }] });
    ddb.on(ScanCommand, { TableName: "bio-experience" }).resolves({
      Items: [
        { id: "a", startDate: "2022-10", visible: true },
        { id: "b", startDate: "2024-12", visible: true },
        { id: "h", startDate: "2020-01", visible: false },
      ],
    });
    ddb.on(ScanCommand, { TableName: "bio-education" }).resolves({ Items: [] });
    ddb.on(ScanCommand, { TableName: "bio-skills" }).resolves({ Items: [] });
    ddb.on(ScanCommand, { TableName: "bio-projects" }).resolves({ Items: [] });

    const content = await getSiteContent(ddb as unknown as DynamoDBDocumentClient);
    expect(content.profile).toEqual({ id: "me", name: "Daniel", visible: true });
    expect(content.experience.map((e) => e.id)).toEqual(["b", "a"]); // newest first, hidden dropped
  });

  it("includes hidden items when includeHidden is true", async () => {
    // Register catch-all before specifics so specific matchers take priority (sinon last-wins)
    ddb.on(ScanCommand).resolves({ Items: [] });
    ddb.on(ScanCommand, { TableName: "bio-experience" }).resolves({ Items: [{ id: "h", startDate: "2020-01", visible: false }] });
    const content = await getSiteContent(ddb as unknown as DynamoDBDocumentClient, { includeHidden: true });
    expect(content.experience.map((e) => e.id)).toEqual(["h"]);
  });

  it("sorts skills and projects by order, missing order last, ties by key", async () => {
    // Mock Scan per table: skills unordered, projects with a missing order.
    ddb.on(ScanCommand, { TableName: "bio-skills" }).resolves({ Items: [
      { category: "practices", order: 3 }, { category: "aws", order: 1 }, { category: "zeta" }, { category: "languages", order: 0 }, { category: "alpha" },
    ] });
    ddb.on(ScanCommand, { TableName: "bio-projects" }).resolves({ Items: [{ id: "b", order: 1 }, { id: "a", order: 0 }, { id: "c" }] });
    ddb.on(ScanCommand, { TableName: "bio-profile" }).resolves({ Items: [] });
    ddb.on(ScanCommand, { TableName: "bio-experience" }).resolves({ Items: [] });
    ddb.on(ScanCommand, { TableName: "bio-education" }).resolves({ Items: [] });
    const c = await getSiteContent(ddb as unknown as DynamoDBDocumentClient);
    expect(c.skills.map((s) => s.category)).toEqual(["languages", "aws", "practices", "alpha", "zeta"]);
    expect(c.projects.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});

describe("posts", () => {
  it("listPosts queries the date GSI newest-first and drops hidden", async () => {
    ddb.on(QueryCommand).resolves({
      Items: [
        { slug: "second", publishedAt: "2026-02-01", visible: true },
        { slug: "hidden", publishedAt: "2026-01-15", visible: false },
        { slug: "first", publishedAt: "2026-01-01", visible: true },
      ],
    });
    const posts = await listPosts(ddb as unknown as DynamoDBDocumentClient, { limit: 10 });
    // Newest-first order is preserved; hidden post is excluded
    expect(posts.items.map((p) => p.slug)).toEqual(["second", "first"]);
    expect(posts.items.some((p) => p.slug === "hidden")).toBe(false);
  });

  it("getPost returns a single post or null", async () => {
    ddb.on(GetCommand, { TableName: "bio-posts", Key: { slug: "x" } }).resolves({ Item: { slug: "x", title: "X", visible: true } });
    expect((await getPost(ddb as unknown as DynamoDBDocumentClient, "x"))?.slug).toBe("x");
    ddb.on(GetCommand, { TableName: "bio-posts", Key: { slug: "missing" } }).resolves({});
    expect(await getPost(ddb as unknown as DynamoDBDocumentClient, "missing")).toBeNull();
  });

  it("returns a cursor pointing at the last returned item when more remain", async () => {
    const client = ddb as unknown as DynamoDBDocumentClient;
    ddb.on(QueryCommand).resolves({
      Items: [
        { slug: "c", type: "post", publishedAt: "2026-03-01T00:00:00.000Z", visible: true },
        { slug: "b", type: "post", publishedAt: "2026-02-01T00:00:00.000Z", visible: true },
        { slug: "a", type: "post", publishedAt: "2026-01-01T00:00:00.000Z", visible: true },
      ],
    });
    const page = await listPosts(client, { limit: 2 });
    expect(page.items.map((i) => i.slug)).toEqual(["c", "b"]);
    expect(page.cursor).not.toBeNull();
    const decoded = JSON.parse(Buffer.from(page.cursor!, "base64url").toString());
    expect(decoded).toEqual({ slug: "b", type: "post", publishedAt: "2026-02-01T00:00:00.000Z" });
  });

  it("passes a cursor through as ExclusiveStartKey and returns null when the page is short", async () => {
    const client = ddb as unknown as DynamoDBDocumentClient;
    ddb.on(QueryCommand).resolves({ Items: [{ slug: "a", type: "post", publishedAt: "2026-01-01T00:00:00.000Z", visible: true }] });
    const cursor = Buffer.from(JSON.stringify({ slug: "b", type: "post", publishedAt: "2026-02-01T00:00:00.000Z" })).toString("base64url");
    const page = await listPosts(client, { limit: 2, cursor });
    const input = ddb.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.ExclusiveStartKey).toEqual({ slug: "b", type: "post", publishedAt: "2026-02-01T00:00:00.000Z" });
    expect(page.cursor).toBeNull();
  });

  it("rejects a malformed cursor", async () => {
    const client = ddb as unknown as DynamoDBDocumentClient;
    await expect(listPosts(client, { cursor: "%%%" })).rejects.toThrow(/invalid cursor/);
  });
});
