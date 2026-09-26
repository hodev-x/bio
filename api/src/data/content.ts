import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { TABLES } from "./client.js";

export interface Item { [k: string]: unknown; visible?: boolean }
export interface SiteContent {
  profile: Item | null;
  experience: Item[];
  education: Item[];
  skills: Item[];
  projects: Item[];
}

const visibleOnly = (items: Item[], includeHidden: boolean) =>
  includeHidden ? items : items.filter((i) => i.visible !== false);

async function scanAll(ddb: DynamoDBDocumentClient, table: string): Promise<Item[]> {
  const items: Item[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    items.push(...((out.Items ?? []) as Item[]));
    ExclusiveStartKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);
  return items;
}

// Sort by a date-ish string field descending (newest first). Missing => oldest.
const byDateDesc = (field: string) => (a: Item, b: Item) =>
  String(b[field] ?? "").localeCompare(String(a[field] ?? ""));

export async function getSiteContent(
  ddb: DynamoDBDocumentClient,
  opts: { includeHidden?: boolean } = {},
): Promise<SiteContent> {
  const includeHidden = opts.includeHidden ?? false;
  const [profile, experience, education, skills, projects] = await Promise.all([
    scanAll(ddb, TABLES.profile),
    scanAll(ddb, TABLES.experience),
    scanAll(ddb, TABLES.education),
    scanAll(ddb, TABLES.skills),
    scanAll(ddb, TABLES.projects),
  ]);
  return {
    profile: visibleOnly(profile, includeHidden)[0] ?? null,
    experience: visibleOnly(experience, includeHidden).sort(byDateDesc("startDate")),
    education: visibleOnly(education, includeHidden).sort(byDateDesc("startDate")),
    skills: visibleOnly(skills, includeHidden),
    projects: visibleOnly(projects, includeHidden),
  };
}

export interface PostPage { items: Item[]; cursor: string | null }

export type PostCursor = { slug: string; type: "post"; publishedAt: string };

export function encodeCursor(c: PostCursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeCursor(raw: string): PostCursor {
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString()) as Partial<PostCursor>;
    if (typeof c.slug !== "string" || typeof c.publishedAt !== "string" || c.type !== "post") throw new Error();
    return { slug: c.slug, type: "post", publishedAt: c.publishedAt };
  } catch {
    throw new Error("invalid cursor");
  }
}

export async function listPosts(
  ddb: DynamoDBDocumentClient,
  opts: { limit?: number; includeHidden?: boolean; cursor?: string } = {},
): Promise<PostPage> {
  const limit = opts.limit ?? 10;
  const collected: Item[] = [];
  // Fetch newest-first and filter visibility in-code, so the public page
  // does not under-fill when hidden posts fall within a DynamoDB Limit window.
  let ExclusiveStartKey: Record<string, unknown> | undefined = opts.cursor ? decodeCursor(opts.cursor) : undefined;
  let exhausted = false;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLES.posts,
        IndexName: "gsi-by-date",
        KeyConditionExpression: "#t = :post",
        ExpressionAttributeNames: { "#t": "type" },
        ExpressionAttributeValues: { ":post": "post" },
        ScanIndexForward: false,
        ExclusiveStartKey,
      }),
    );
    collected.push(...visibleOnly((out.Items ?? []) as Item[], opts.includeHidden ?? false));
    ExclusiveStartKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
    exhausted = !ExclusiveStartKey;
    // Loop condition is <= so we learn whether an item beyond `limit` exists.
  } while (!exhausted && collected.length <= limit);
  const items = collected.slice(0, limit);
  const more = collected.length > limit || !exhausted;
  const last = items.at(-1);
  const cursor = more && last ? encodeCursor({ slug: String(last.slug), type: "post", publishedAt: String(last.publishedAt) }) : null;
  return { items, cursor };
}

// Returns the raw item (may be visible:false); public callers MUST enforce visibility.
export async function getPost(
  ddb: DynamoDBDocumentClient,
  slug: string,
): Promise<Item | null> {
  const out = await ddb.send(new GetCommand({ TableName: TABLES.posts, Key: { slug } }));
  return (out.Item as Item) ?? null;
}
