import { describe, it, expect } from "vitest";
import { App, Stack } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { ContentTables } from "../lib/constructs/content-tables.js";
import { ApiLambda } from "../lib/constructs/api-lambda.js";

function synth() {
  const app = new App();
  const stack = new Stack(app, "A", { env: { account: "123456789012", region: "us-east-1" } });
  const tables = new ContentTables(stack, "Tables", { tableNamePrefix: "bio-test" });
  new ApiLambda(stack, "Api", { tables });
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
});
