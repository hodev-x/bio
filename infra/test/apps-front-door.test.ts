import { describe, it, expect } from "vitest";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { BioStack } from "../lib/bio-stack.js";

function synth(envName: "staging" | "prod") {
  const app = new App();
  const stack = new BioStack(app, `BioStack-${envName}`, {
    envName,
    zoneDomain: "danielhodeta.com",
    env: { account: "123456789012", region: "us-east-1" },
  });
  return { stack, t: Template.fromStack(stack) };
}

describe("apps front door — parameters", () => {
  it("publishes the distribution id, ARN and domain as SSM String parameters", () => {
    const { t } = synth("staging");
    t.hasResourceProperties("AWS::SSM::Parameter", {
      Name: "/platform/staging/front-door/distribution-id",
      Type: "String",
      Value: { Ref: Match.stringLikeRegexp("^SiteDistribution") },
    });
    t.hasResourceProperties("AWS::SSM::Parameter", {
      Name: "/platform/staging/front-door/distribution-domain",
      Type: "String",
      Value: { "Fn::GetAtt": [Match.stringLikeRegexp("^SiteDistribution"), "DomainName"] },
    });
    const arn = Object.values(t.findResources("AWS::SSM::Parameter"))
      .find((r) => r.Properties.Name === "/platform/staging/front-door/distribution-arn");
    expect(JSON.stringify(arn?.Properties.Value)).toContain(":cloudfront::123456789012:distribution/");
  });

  it("uses the environment in the parameter path", () => {
    synth("prod").t.hasResourceProperties("AWS::SSM::Parameter", {
      Name: "/platform/prod/front-door/distribution-id",
    });
  });
});
