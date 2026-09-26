import { describe, it, expect } from "vitest";
import { App, Stack } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { StaticSite } from "../lib/constructs/static-site.js";
import { spaFallbackCode } from "../lib/constructs/spa-fallback-function.js";

const synth = () => {
  const stack = new Stack(new App(), "S", { env: { account: "123456789012", region: "us-east-1" } });
  new StaticSite(stack, "Site", {
    domainName: "staging.danielhodeta.com", zoneName: "danielhodeta.com", webDistPath: "../web/dist",
    apiOrigin: "abc.execute-api.us-east-1.amazonaws.com", originVerifyParam: "/bio/staging/origin-verify",
  });
  return Template.fromStack(stack);
};

describe("SPA fallback + origin verify", () => {
  it("has no distribution-wide error responses and one viewer-request function on the default behavior only", () => {
    const t = synth();
    t.resourceCountIs("AWS::CloudFront::Function", 1);
    const dist = Object.values(t.findResources("AWS::CloudFront::Distribution"))[0].Properties.DistributionConfig;
    expect(dist.CustomErrorResponses).toBeUndefined();
    expect(dist.DefaultCacheBehavior.FunctionAssociations).toEqual([expect.objectContaining({ EventType: "viewer-request" })]);
    const api = (dist.CacheBehaviors as Array<{ PathPattern: string; FunctionAssociations?: unknown }>).find((b) => b.PathPattern === "/api/*");
    expect(api?.FunctionAssociations).toBeUndefined();
  });
  it("sends x-origin-verify to the API origin via an SSM dynamic reference", () => {
    synth().hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        Origins: Match.arrayWith([Match.objectLike({
          OriginCustomHeaders: [{ HeaderName: "x-origin-verify", HeaderValue: "{{resolve:ssm:/bio/staging/origin-verify}}" }],
        })]),
      }),
    });
  });
  it("function code rewrites extension-less paths and leaves assets alone", () => {
    const fn = new Function("event", spaFallbackCode().replace(/^function handler\(event\) \{/, "").replace(/\}\s*$/, ""));
    const run = (uri: string) => (fn({ request: { uri } }) as { uri: string }).uri;
    expect(run("/blog/hello")).toBe("/index.html");
    expect(run("/blog")).toBe("/index.html");
    expect(run("/")).toBe("/");
    expect(run("/assets/app-abc.js")).toBe("/assets/app-abc.js");
    expect(run("/favicon.svg")).toBe("/favicon.svg");
  });
});
