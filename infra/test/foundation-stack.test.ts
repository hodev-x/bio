import { describe, it } from "vitest";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { BioFoundationStack } from "../lib/foundation-stack.js";

function synth() {
  const app = new App();
  const stack = new BioFoundationStack(app, "BioFoundation", {
    env: { account: "123456789012", region: "us-east-1" },
  });
  return Template.fromStack(stack);
}

describe("BioFoundationStack", () => {
  it("creates a GitHub OIDC provider", () => {
    const t = synth();
    t.hasResourceProperties("Custom::AWSCDKOpenIdConnectProvider", {
      Url: "https://token.actions.githubusercontent.com",
    });
  });

  it("creates an IAM role for GitHub Actions deployments", () => {
    const t = synth();
    t.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Condition: Match.objectLike({
              StringEquals: Match.objectLike({
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
              }),
            }),
          }),
        ]),
      }),
    });
  });
});
