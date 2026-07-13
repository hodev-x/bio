import {
  DynamoDBDocumentClient, PutCommand, DeleteCommand, UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { KEY_BY_TYPE, type EntityType } from "@bio/shared";
import { TABLES } from "./client.js";

const TABLE_BY_TYPE: Record<EntityType, string> = {
  profile: TABLES.profile,
  experience: TABLES.experience,
  education: TABLES.education,
  skills: TABLES.skills,
  projects: TABLES.projects,
  posts: TABLES.posts,
};

const isConditionalFailure = (e: unknown) =>
  e instanceof Error && e.name === "ConditionalCheckFailedException";

// Posts carry a constant `type` attribute: it is the partition key of the
// gsi-by-date index the read path queries. Other types need no extra attrs.
const withIndexAttrs = (type: EntityType, item: Record<string, unknown>) =>
  type === "posts" ? { ...item, type: "post" } : item;

export async function putEntity(
  ddb: DynamoDBDocumentClient, type: EntityType, item: Record<string, unknown>,
): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE_BY_TYPE[type], Item: withIndexAttrs(type, item) }));
}

export async function createPost(
  ddb: DynamoDBDocumentClient, item: Record<string, unknown>,
): Promise<boolean> {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLES.posts,
      Item: withIndexAttrs("posts", item),
      ConditionExpression: "attribute_not_exists(slug)",
    }));
    return true;
  } catch (e) {
    if (isConditionalFailure(e)) return false;
    throw e;
  }
}

export async function deleteEntity(
  ddb: DynamoDBDocumentClient, type: EntityType, key: string,
): Promise<void> {
  await ddb.send(new DeleteCommand({
    TableName: TABLE_BY_TYPE[type],
    Key: { [KEY_BY_TYPE[type]]: key },
  }));
}

export async function patchVisible(
  ddb: DynamoDBDocumentClient, type: EntityType, key: string, visible: boolean,
): Promise<boolean> {
  const keyAttr = KEY_BY_TYPE[type];
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE_BY_TYPE[type],
      Key: { [keyAttr]: key },
      UpdateExpression: "SET #v = :v",
      ConditionExpression: `attribute_exists(#k)`,
      ExpressionAttributeNames: { "#v": "visible", "#k": keyAttr },
      ExpressionAttributeValues: { ":v": visible },
    }));
    return true;
  } catch (e) {
    if (isConditionalFailure(e)) return false;
    throw e;
  }
}
