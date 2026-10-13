import { App } from "aws-cdk-lib";
import { BioStack } from "../lib/bio-stack.js";
import { BioFoundationStack } from "../lib/foundation-stack.js";
import { APPS_BY_ENV } from "../lib/apps.js";

const app = new App();
const zoneDomain = app.node.tryGetContext("domainName") as string; // "danielhodeta.com"
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

new BioFoundationStack(app, "BioFoundation", { env });
new BioStack(app, "BioStack-staging", { envName: "staging", zoneDomain, apps: APPS_BY_ENV.staging, env });
new BioStack(app, "BioStack-prod", { envName: "prod", zoneDomain, apps: APPS_BY_ENV.prod, env });
