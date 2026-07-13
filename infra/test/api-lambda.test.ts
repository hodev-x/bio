import { describe, it, expect } from "vitest";
import { App, Stack } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { ContentTables } from "../lib/constructs/content-tables.js";
import { ApiLambda } from "../lib/constructs/api-lambda.js";

function synth() {
  const app = new App();
  const stack = new Stack(app, "A", { env: { account: "123456789012", region: "us-east-1" } });
  const tables = new ContentTables(stack, "Tables", { tableNamePrefix: "bio-test" });
  new ApiLambda(stack, "Api", { tables, envName: "test", rpId: "staging.danielhodeta.com" });
  return Template.fromStack(stack);
}

describe("ApiLambda", () => {
  it("creates a Node Lambda with the LWA exec wrapper env", () => {
    const t = synth();
    t.hasResourceProperties("AWS::Lambda::Function", {
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
        }),
      }),
    });
  });

  it("passes table names to the function as env vars", () => {
    const t = synth();
    t.hasResourceProperties("AWS::Lambda::Function", {
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          TABLE_POSTS: Match.anyValue(),
          TABLE_PROFILE: Match.anyValue(),
        }),
      }),
    });
  });

  it("creates an HTTP API with a default route to the function", () => {
    const t = synth();
    t.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
    t.hasResourceProperties("AWS::ApiGatewayV2::Api", { ProtocolType: "HTTP" });
  });

  it("grants the function read access to the tables", () => {
    const t = synth();
    // At least one IAM policy with dynamodb read actions
    const policies = t.findResources("AWS::IAM::Policy");
    const json = JSON.stringify(policies);
    expect(json).toContain("dynamodb:GetItem");
    expect(json).toContain("dynamodb:Query");
  });

  it("grants the function write access to each content table (write routes need Put/Update/Delete)", () => {
    const t = synth();
    const policies = t.findResources("AWS::IAM::Policy");
    const policyDoc = Object.values(policies)[0] as {
      Properties: { PolicyDocument: { Statement: Array<{ Action: unknown; Resource: unknown }> } };
    };
    const statements = policyDoc.Properties.PolicyDocument.Statement;

    // Content tables: profile, experience, education, skills, projects, posts.
    // (Auth tables — credentials, authChallenges — already get read+write and are
    // intentionally excluded here.)
    const contentTableLogicalIdPrefixes = [
      "TablesProfile",
      "TablesExperience",
      "TablesEducation",
      "TablesSkills",
      "TablesProjects",
      "TablesPosts",
    ];

    for (const prefix of contentTableLogicalIdPrefixes) {
      const writeStatement = statements.find((s) => {
        const actions = Array.isArray(s.Action) ? s.Action : [];
        return (
          JSON.stringify(s.Resource).includes(`"${prefix}`) &&
          actions.includes("dynamodb:PutItem")
        );
      });
      expect(
        writeStatement,
        `expected a write-granting IAM statement referencing ${prefix}`,
      ).toBeDefined();
      expect(writeStatement!.Action).toEqual(
        expect.arrayContaining([
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
        ]),
      );
    }
  });
});
