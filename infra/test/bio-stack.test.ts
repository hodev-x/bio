import { describe, it, expect } from "vitest";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { BioStack } from "../lib/bio-stack.js";

function synth() {
  const app = new App();
  const stack = new BioStack(app, "TestStack", {
    domainName: "danielhodeta.com",
    env: { account: "123456789012", region: "us-east-1" },
  });
  return Template.fromStack(stack);
}

describe("BioStack", () => {
  it("synthesizes without error", () => {
    expect(() => synth()).not.toThrow();
  });
});
