import { App } from "aws-cdk-lib";
import { BioStack } from "../lib/bio-stack.js";

const app = new App();
const domainName = app.node.tryGetContext("domainName") as string;

new BioStack(app, "BioStack", {
  domainName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
});
