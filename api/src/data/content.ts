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
  const out = await ddb.send(new ScanCommand({ TableName: table }));
  return (out.Items ?? []) as Item[];
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

export async function listPosts(
  ddb: DynamoDBDocumentClient,
  opts: { limit?: number; includeHidden?: boolean } = {},
): Promise<PostPage> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: TABLES.posts,
      IndexName: "gsi-by-date",
      KeyConditionExpression: "#t = :post",
      ExpressionAttributeNames: { "#t": "type" },
      ExpressionAttributeValues: { ":post": "post" },
      ScanIndexForward: false, // newest first
      Limit: opts.limit ?? 10,
    }),
  );
  const items = visibleOnly((out.Items ?? []) as Item[], opts.includeHidden ?? false);
  return { items, cursor: null };
}

export async function getPost(
  ddb: DynamoDBDocumentClient,
  slug: string,
): Promise<Item | null> {
  const out = await ddb.send(new GetCommand({ TableName: TABLES.posts, Key: { slug } }));
  return (out.Item as Item) ?? null;
}
