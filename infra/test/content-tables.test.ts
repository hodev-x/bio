import { describe, it, expect } from "vitest";
import { App, Stack } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { ContentTables } from "../lib/constructs/content-tables.js";

function synth() {
  const app = new App();
  const stack = new Stack(app, "C", { env: { account: "123456789012", region: "us-east-1" } });
  new ContentTables(stack, "Tables", { tableNamePrefix: "bio-staging" });
  return Template.fromStack(stack);
}

describe("ContentTables", () => {
  it("creates 8 on-demand tables (6 content + credentials + authChallenges)", () => {
    const t = synth();
    t.resourceCountIs("AWS::DynamoDB::Table", 8);
    // all on-demand (PAY_PER_REQUEST => no ProvisionedThroughput)
    const tables = t.findResources("AWS::DynamoDB::Table");
    for (const id of Object.keys(tables)) {
      expect(tables[id].Properties.BillingMode).toBe("PAY_PER_REQUEST");
    }
  });

  it("keys posts by slug with a date GSI for newest-first listing", () => {
    const t = synth();
    t.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [{ AttributeName: "slug", KeyType: "HASH" }],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: "gsi-by-date",
          KeySchema: [
            { AttributeName: "type", KeyType: "HASH" },
            { AttributeName: "publishedAt", KeyType: "RANGE" },
          ],
        }),
      ]),
    });
  });

  it("exposes named table references", () => {
    const app = new App();
    const stack = new Stack(app, "C2", { env: { account: "123456789012", region: "us-east-1" } });
    const tables = new ContentTables(stack, "Tables", { tableNamePrefix: "bio-staging" });
    expect(tables.profile).toBeDefined();
    expect(tables.posts).toBeDefined();
    expect(tables.projects).toBeDefined();
  });

  it("uses the prefix in table names (e.g. bio-staging-posts)", () => {
    const t = synth();
    t.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "bio-staging-posts",
    });
  });

  it("creates a credentials table and a TTL challenges table", () => {
    const t = synth();
    // 6 content + credentials + challenges = 8 tables
    t.resourceCountIs("AWS::DynamoDB::Table", 8);
    t.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "bio-staging-credentials",
    });
    t.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "bio-staging-auth-challenges",
      TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
    });
  });
});
