import { describe, it, expect } from "vitest";
import { App, Stack } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { DeployPipeline } from "../lib/constructs/pipeline.js";

function synth() {
  const app = new App();
  const stack = new Stack(app, "P", { env: { account: "123456789012", region: "us-east-1" } });
  new DeployPipeline(stack, "Pipeline", {
    githubOwner: "hodev-x",
    githubRepo: "bio",
  });
  return Template.fromStack(stack);
}

describe("DeployPipeline", () => {
  it("creates a GitHub OIDC provider", () => {
    const t = synth();
    t.hasResourceProperties("Custom::AWSCDKOpenIdConnectProvider", {
      Url: "https://token.actions.githubusercontent.com",
    });
  });

  it("trusts pushes to main and the gated production environment (exact aud + sub)", () => {
    const t = synth();
    t.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Condition: Match.objectLike({
              StringEquals: Match.objectLike({
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                // GitHub emits a different `sub` for the branch push (staging) vs the
                // environment-gated prod workflow; both are allowed (StringEquals list = OR).
                "token.actions.githubusercontent.com:sub": Match.arrayWith([
                  "repo:hodev-x/bio:ref:refs/heads/main",
                  "repo:hodev-x/bio:environment:production",
                ]),
              }),
            }),
          }),
        ]),
      }),
    });
  });

  it("does NOT use a wildcard sub that would allow any branch/PR", () => {
    const t = synth();
    const roles = t.findResources("AWS::IAM::Role");
    const json = JSON.stringify(roles);
    expect(json).not.toContain("repo:hodev-x/bio:*");
  });
});
