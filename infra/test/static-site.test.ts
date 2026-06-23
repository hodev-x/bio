import { describe, it, expect } from "vitest";
import { App, Stack } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { StaticSite } from "../lib/constructs/static-site.js";

function synth() {
  const app = new App();
  const stack = new Stack(app, "S", { env: { account: "123456789012", region: "us-east-1" } });
  new StaticSite(stack, "Site", {
    domainName: "danielhodeta.com",
    webDistPath: "../web/dist",
  });
  return Template.fromStack(stack);
}

describe("StaticSite", () => {
  it("creates a private S3 bucket (no public access)", () => {
    const t = synth();
    t.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it("creates a CloudFront distribution serving the apex and www aliases", () => {
    const t = synth();
    t.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        Aliases: Match.arrayWith(["danielhodeta.com", "www.danielhodeta.com"]),
      }),
    });
  });

  it("rewrites 403/404 to /index.html with 200 for SPA routing", () => {
    const t = synth();
    t.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({ ErrorCode: 403, ResponseCode: 200, ResponsePagePath: "/index.html" }),
          Match.objectLike({ ErrorCode: 404, ResponseCode: 200, ResponsePagePath: "/index.html" }),
        ]),
      }),
    });
  });

  it("creates Route53 A records for apex and www", () => {
    const t = synth();
    t.resourceCountIs("AWS::Route53::RecordSet", 2);
  });

  it("deploys the web build into the bucket via a BucketDeployment", () => {
    const t = synth();
    // BucketDeployment provisions a custom resource backed by a Lambda.
    t.resourceCountIs("Custom::CDKBucketDeployment", 1);
  });
});
