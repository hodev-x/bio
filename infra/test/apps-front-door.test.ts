import { describe, it, expect } from "vitest";
import { App } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { BioStack } from "../lib/bio-stack.js";
import { APPS_BY_ENV, validateAppNames } from "../lib/apps.js";
import { appApiPrefixStripCode, appSpaFallbackCode } from "../lib/constructs/app-functions.js";

const CACHING_DISABLED = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad";
const CACHING_OPTIMIZED = "658327ea-f89d-4fab-a63d-7e88639e58f6";
const ALL_VIEWER_EXCEPT_HOST_HEADER = "b689b0a8-53d0-40ab-baf2-68738e2966ac";

type Behavior = {
  PathPattern: string;
  TargetOriginId: string;
  AllowedMethods?: string[];
  CachePolicyId: string;
  OriginRequestPolicyId?: string;
  ViewerProtocolPolicy: string;
  FunctionAssociations?: { EventType: string; FunctionARN: { "Fn::GetAtt": [string, string] } }[];
};
type Origin = {
  Id: string;
  DomainName: unknown;
  CustomOriginConfig?: { OriginProtocolPolicy: string };
  OriginAccessControlId?: unknown;
};

function synth(envName: "staging" | "prod", apps: readonly string[] = []) {
  const app = new App();
  const stack = new BioStack(app, `BioStack-${envName}`, {
    envName,
    zoneDomain: "danielhodeta.com",
    apps,
    env: { account: "123456789012", region: "us-east-1" },
  });
  return { stack, t: Template.fromStack(stack) };
}

function distributionConfig(t: Template) {
  return Object.values(t.findResources("AWS::CloudFront::Distribution"))[0].Properties.DistributionConfig as {
    CacheBehaviors: Behavior[];
    Origins: Origin[];
  };
}

function functionLogicalId(t: Template, code: string) {
  const [id] = Object.entries(t.findResources("AWS::CloudFront::Function"))
    .find(([, r]) => r.Properties.FunctionCode === code) ?? [];
  return id;
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

describe("apps front door — routes", () => {
  it("adds /apps/<name>/api/* before /apps/<name>/*", () => {
    const patterns = distributionConfig(synth("staging", ["fluxor"]).t).CacheBehaviors.map((b) => b.PathPattern);
    expect(patterns).toEqual(["/api/*", "/apps/fluxor/api/*", "/apps/fluxor/*"]);
  });

  it("routes the API behavior to the app's API domain from SSM, uncached, all methods, with the prefix strip", () => {
    const { t } = synth("staging", ["fluxor"]);
    const dist = distributionConfig(t);
    const api = dist.CacheBehaviors.find((b) => b.PathPattern === "/apps/fluxor/api/*")!;
    expect(api.AllowedMethods).toEqual(["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"]);
    expect(api.CachePolicyId).toBe(CACHING_DISABLED);
    expect(api.OriginRequestPolicyId).toBe(ALL_VIEWER_EXCEPT_HOST_HEADER);
    expect(api.ViewerProtocolPolicy).toBe("redirect-to-https");
    expect(api.FunctionAssociations).toEqual([
      { EventType: "viewer-request", FunctionARN: { "Fn::GetAtt": [functionLogicalId(t, appApiPrefixStripCode()), "FunctionARN"] } },
    ]);
    const origin = dist.Origins.find((o) => o.Id === api.TargetOriginId)!;
    expect(origin.CustomOriginConfig?.OriginProtocolPolicy).toBe("https-only");
    const params = t.toJSON().Parameters as Record<string, { Type: string; Default: string }>;
    const ref = (origin.DomainName as { Ref: string }).Ref;
    expect(params[ref]).toEqual({ Type: "AWS::SSM::Parameter::Value<String>", Default: "/platform/staging/apps/fluxor/api-domain" });
  });

  it("routes the app behavior to the app's bucket via OAC, cached, with the app SPA fallback", () => {
    const { t } = synth("staging", ["fluxor"]);
    const dist = distributionConfig(t);
    const site = dist.CacheBehaviors.find((b) => b.PathPattern === "/apps/fluxor/*")!;
    expect(site.CachePolicyId).toBe(CACHING_OPTIMIZED);
    expect(site.ViewerProtocolPolicy).toBe("redirect-to-https");
    expect(site.FunctionAssociations).toEqual([
      { EventType: "viewer-request", FunctionARN: { "Fn::GetAtt": [functionLogicalId(t, appSpaFallbackCode()), "FunctionARN"] } },
    ]);
    const origin = dist.Origins.find((o) => o.Id === site.TargetOriginId)!;
    expect(origin.OriginAccessControlId).toBeDefined();
    const params = t.toJSON().Parameters as Record<string, { Type: string; Default: string }>;
    const domain = JSON.stringify(origin.DomainName);
    const bucketParam = Object.entries(params).find(([, p]) => p.Default === "/platform/staging/apps/fluxor/site-bucket-name");
    expect(bucketParam?.[1].Type).toBe("AWS::SSM::Parameter::Value<String>");
    expect(domain).toContain(`{"Ref":"${bucketParam?.[0]}"}`);
    expect(domain).toContain(".s3.us-east-1.");
  });

  it("creates the two app functions once, alongside the default SPA fallback", () => {
    synth("staging", ["fluxor", "gym"]).t.resourceCountIs("AWS::CloudFront::Function", 3);
  });

  it("does not warn about the imported bucket's policy", () => {
    const { stack } = synth("staging", ["fluxor"]);
    Annotations.fromStack(stack).hasNoWarning("*", Match.stringLikeRegexp("updateImportedBucketPolicyOac"));
  });

  it("keeps the staging DNS record's logical id", () => {
    const records = synth("staging", ["fluxor"]).t.findResources("AWS::Route53::RecordSet");
    expect(Object.keys(records)).toEqual(["SitePrimaryAF41F6FE6"]);
  });

  it("adds nothing for an empty app list", () => {
    const { t } = synth("staging", []);
    const patterns = distributionConfig(t).CacheBehaviors.map((b) => b.PathPattern);
    expect(patterns).toEqual(["/api/*"]);
    t.resourceCountIs("AWS::CloudFront::Function", 1);
  });
});

describe("apps front door — configuration", () => {
  it("prod routes no apps yet", () => {
    expect(APPS_BY_ENV.prod).toEqual([]);
    const { t } = synth("prod", APPS_BY_ENV.prod);
    const patterns = distributionConfig(t).CacheBehaviors.map((b) => b.PathPattern);
    expect(patterns.filter((p) => p.startsWith("/apps/"))).toEqual([]);
    const ssmParams = Object.values(t.toJSON().Parameters as Record<string, { Default: string }>)
      .filter((p) => p.Default.startsWith("/platform/"));
    expect(ssmParams).toEqual([]);
  });

  it("every configured name is valid", () => {
    for (const apps of Object.values(APPS_BY_ENV)) expect(() => validateAppNames(apps)).not.toThrow();
  });

  it.each([["Fluxor"], ["1app"], [""], ["a/b"], ["fluxor "], ["-x"]])("fails synth for the app name %j", (name) => {
    expect(() => synth("staging", [name])).toThrow(/invalid app name/);
  });

  it("fails synth for a duplicate app name", () => {
    expect(() => synth("staging", ["fluxor", "fluxor"])).toThrow(/duplicate app name "fluxor"/);
  });
});
