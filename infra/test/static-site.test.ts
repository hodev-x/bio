import { describe, it, expect } from "vitest";
import { App, Stack } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { StaticSite } from "../lib/constructs/static-site.js";

function synthApex() {
  const app = new App();
  const stack = new Stack(app, "S", { env: { account: "123456789012", region: "us-east-1" } });
  new StaticSite(stack, "Site", {
    domainName: "danielhodeta.com",
    zoneName: "danielhodeta.com",
    includeWww: true,
    webDistPath: "../web/dist",
    apiOrigin: "abc.execute-api.us-east-1.amazonaws.com",
    originVerifyParam: "/bio/prod/origin-verify",
  });
  return Template.fromStack(stack);
}

function synthSubdomain() {
  const app = new App();
  const stack = new Stack(app, "S2", { env: { account: "123456789012", region: "us-east-1" } });
  new StaticSite(stack, "Site", {
    domainName: "staging.danielhodeta.com",
    zoneName: "danielhodeta.com",
    includeWww: false,
    webDistPath: "../web/dist",
  });
  return Template.fromStack(stack);
}

describe("StaticSite — APEX (includeWww: true)", () => {
  it("creates a private S3 bucket (no public access)", () => {
    const t = synthApex();
    t.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it("creates a CloudFront distribution with both apex and www aliases", () => {
    const t = synthApex();
    t.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        Aliases: Match.arrayWith(["danielhodeta.com", "www.danielhodeta.com"]),
      }),
    });
  });

  it("has no distribution-wide error responses (SPA fallback is a per-behavior CloudFront Function instead)", () => {
    const t = synthApex();
    const dist = Object.values(t.findResources("AWS::CloudFront::Distribution"))[0].Properties.DistributionConfig;
    expect(dist.CustomErrorResponses).toBeUndefined();
  });

  it("creates exactly 2 Route53 A record sets (apex + www)", () => {
    const t = synthApex();
    t.resourceCountIs("AWS::Route53::RecordSet", 2);
  });

  it("deploys the web build into the bucket via a BucketDeployment", () => {
    const t = synthApex();
    t.resourceCountIs("Custom::CDKBucketDeployment", 1);
  });

  it("adds an /api/* behavior with caching disabled", () => {
    const t = synthApex();
    t.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({ PathPattern: "/api/*" }),
        ]),
      }),
    });
  });
});

describe("StaticSite — SUBDOMAIN (includeWww: false)", () => {
  it("creates exactly 1 Route53 A record set (no www)", () => {
    const t = synthSubdomain();
    t.resourceCountIs("AWS::Route53::RecordSet", 1);
  });

  it("distribution aliases do NOT include a www record", () => {
    const t = synthSubdomain();
    const distributions = t.findResources("AWS::CloudFront::Distribution");
    const aliases: string[] = [];
    for (const dist of Object.values(distributions)) {
      const a = (dist as Record<string, Record<string, Record<string, string[]>>>).Properties?.DistributionConfig?.Aliases;
      if (Array.isArray(a)) aliases.push(...a);
    }
    expect(aliases).toContain("staging.danielhodeta.com");
    expect(aliases).not.toContain("www.staging.danielhodeta.com");
  });

  it("creates a private S3 bucket (no public access)", () => {
    const t = synthSubdomain();
    t.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it("has no distribution-wide error responses (SPA fallback is a per-behavior CloudFront Function instead)", () => {
    const t = synthSubdomain();
    const dist = Object.values(t.findResources("AWS::CloudFront::Distribution"))[0].Properties.DistributionConfig;
    expect(dist.CustomErrorResponses).toBeUndefined();
  });

  it("deploys the web build into the bucket via a BucketDeployment", () => {
    const t = synthSubdomain();
    t.resourceCountIs("Custom::CDKBucketDeployment", 1);
  });
});
