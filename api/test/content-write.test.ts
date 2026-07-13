import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient, PutCommand, DeleteCommand, UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { putEntity, createPost, deleteEntity, patchVisible } from "../src/data/content-write.js";

const ddbMock = mockClient(DynamoDBDocumentClient);
const ddb = DynamoDBDocumentClient.prototype as never; // mock intercepts by class

const conditionalError = () => {
  const err = new Error("conditional check failed");
  err.name = "ConditionalCheckFailedException";
  return err;
};

beforeEach(() => ddbMock.reset());

describe("content-write", () => {
  it("putEntity writes the full item to the type's table", async () => {
    ddbMock.on(PutCommand).resolves({});
    await putEntity(ddb, "projects", { id: "money-lens", title: "t", desc: "d", status: "active", visible: true });
    const call = ddbMock.commandCalls(PutCommand)[0].args[0].input;
    expect(call.TableName).toBe("bio-projects");
    expect(call.Item).toMatchObject({ id: "money-lens", title: "t" });
  });

  it("putEntity stamps type=post on posts (GSI partition attr)", async () => {
    ddbMock.on(PutCommand).resolves({});
    await putEntity(ddb, "posts", { slug: "hi", title: "t", body: "b", visible: true });
    expect(ddbMock.commandCalls(PutCommand)[0].args[0].input.Item).toMatchObject({ slug: "hi", type: "post" });
  });

  it("createPost returns true on success, false when the slug exists", async () => {
    ddbMock.on(PutCommand).resolvesOnce({}).rejectsOnce(conditionalError());
    expect(await createPost(ddb, { slug: "a", title: "t", body: "b" })).toBe(true);
    expect(await createPost(ddb, { slug: "a", title: "t", body: "b" })).toBe(false);
    const first = ddbMock.commandCalls(PutCommand)[0].args[0].input;
    expect(first.ConditionExpression).toBe("attribute_not_exists(slug)");
    expect(first.Item).toMatchObject({ type: "post" });
  });

  it("deleteEntity deletes by the type's key attribute", async () => {
    ddbMock.on(DeleteCommand).resolves({});
    await deleteEntity(ddb, "skills", "languages");
    const call = ddbMock.commandCalls(DeleteCommand)[0].args[0].input;
    expect(call.TableName).toBe("bio-skills");
    expect(call.Key).toEqual({ category: "languages" });
  });

  it("patchVisible updates visible and returns false when the item is missing", async () => {
    ddbMock.on(UpdateCommand).resolvesOnce({}).rejectsOnce(conditionalError());
    expect(await patchVisible(ddb, "experience", "amazon-sde", false)).toBe(true);
    const call = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(call.TableName).toBe("bio-experience");
    expect(call.Key).toEqual({ id: "amazon-sde" });
    expect(call.ExpressionAttributeValues).toEqual({ ":v": false });
    expect(await patchVisible(ddb, "experience", "ghost", false)).toBe(false);
  });

  it("non-conditional errors propagate", async () => {
    ddbMock.on(UpdateCommand).rejects(new Error("boom"));
    await expect(patchVisible(ddb, "posts", "x", true)).rejects.toThrow("boom");
  });
});
