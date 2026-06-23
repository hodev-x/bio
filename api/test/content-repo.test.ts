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
});

describe("posts", () => {
  it("listPosts queries the date GSI newest-first and drops hidden", async () => {
    ddb.on(QueryCommand).resolves({
      Items: [
        { slug: "second", publishedAt: "2026-02-01", visible: true },
        { slug: "first", publishedAt: "2026-01-01", visible: true },
      ],
    });
    const posts = await listPosts(ddb as unknown as DynamoDBDocumentClient, { limit: 10 });
    expect(posts.items.map((p) => p.slug)).toEqual(["second", "first"]);
  });

  it("getPost returns a single post or null", async () => {
    ddb.on(GetCommand, { TableName: "bio-posts", Key: { slug: "x" } }).resolves({ Item: { slug: "x", title: "X", visible: true } });
    expect((await getPost(ddb as unknown as DynamoDBDocumentClient, "x"))?.slug).toBe("x");
    ddb.on(GetCommand, { TableName: "bio-posts", Key: { slug: "missing" } }).resolves({});
    expect(await getPost(ddb as unknown as DynamoDBDocumentClient, "missing")).toBeNull();
  });
});
