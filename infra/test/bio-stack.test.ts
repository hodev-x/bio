import { describe, it, expect } from "vitest";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { BioStack } from "../lib/bio-stack.js";

function synth() {
  const app = new App();
  const stack = new BioStack(app, "BioStack-staging", {
    envName: "staging",
    zoneDomain: "danielhodeta.com",
    env: { account: "123456789012", region: "us-east-1" },
  });
  return Template.fromStack(stack);
}

describe("BioStack", () => {
  it("synthesizes without error", () => {
    expect(() => synth()).not.toThrow();
  });

  it("does not contain a pipeline (OIDC/IAM WebIdentity) in the env stack", () => {
    const t = synth();
    // The deploy pipeline was moved to BioFoundationStack; no OIDC provider here.
    const resources = t.findResources("Custom::AWSCDKOpenIdConnectProvider");
    expect(Object.keys(resources)).toHaveLength(0);
  });

  it("creates DynamoDB tables with the bio-staging prefix", () => {
    const t = synth();
    t.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "bio-staging-posts",
    });
  });
});
