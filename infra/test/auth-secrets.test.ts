import { describe, it, expect } from "vitest";
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { AuthSecrets } from "../lib/constructs/auth-secrets.js";

function synth() {
  const app = new App();
  const stack = new Stack(app, "S", { env: { account: "123456789012", region: "us-east-1" } });
  new AuthSecrets(stack, "Auth", { envName: "staging" });
  return Template.fromStack(stack);
}

describe("AuthSecrets", () => {
  it("creates three SecureString-style SSM params under the env path", () => {
    const t = synth();
    t.resourceCountIs("AWS::SSM::Parameter", 3);
    for (const name of ["jwt-signing-key", "mcp-client-secret-hash", "passkey-bootstrap-token"]) {
      t.hasResourceProperties("AWS::SSM::Parameter", {
        Name: `/bio/staging/${name}`,
      });
    }
  });
});
