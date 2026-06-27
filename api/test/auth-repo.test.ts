import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import * as repo from "../src/data/auth.js";

const ddb = mockClient(DynamoDBDocumentClient);
beforeEach(() => { ddb.reset(); process.env.TABLE_CREDENTIALS = "bio-staging-credentials"; process.env.TABLE_AUTH_CHALLENGES = "bio-staging-auth-challenges"; });

describe("auth repo", () => {
  it("saves and gets a credential", async () => {
    ddb.on(PutCommand).resolves({});
    ddb.on(GetCommand).resolves({ Item: { id: "cred1", type: "passkey", publicKey: "pk", counter: 0 } });
    await repo.saveCredential(ddb as any, { id: "cred1", type: "passkey", publicKey: "pk", counter: 0, transports: [] });
    expect((await repo.getCredential(ddb as any, "cred1"))?.publicKey).toBe("pk");
  });

  it("countCredentials counts only passkeys", async () => {
    ddb.on(ScanCommand).resolves({ Items: [{ id: "c1", type: "passkey" }, { id: "recovery#1", type: "recovery" }] });
    expect(await repo.countCredentials(ddb as any)).toBe(1);
  });

  it("consumeChallenge returns then deletes", async () => {
    ddb.on(GetCommand).resolves({ Item: { id: "flow1", challenge: "abc" } });
    ddb.on(DeleteCommand).resolves({});
    expect(await repo.consumeChallenge(ddb as any, "flow1")).toBe("abc");
    expect(ddb.commandCalls(DeleteCommand)).toHaveLength(1);
  });
});
