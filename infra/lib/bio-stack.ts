import * as path from "node:path";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StaticSite } from "./constructs/static-site.js";
import { DeployPipeline } from "./constructs/pipeline.js";
import { ContentTables } from "./constructs/content-tables.js";

export interface BioStackProps extends StackProps {
  domainName: string;
}

// Anchor the web build path to this file's location so it resolves the same
// regardless of the process working directory at synth/deploy time.
// infra/lib -> ../../web/dist == <repo>/web/dist
const WEB_DIST_PATH = path.resolve(import.meta.dirname, "../../web/dist");

export class BioStack extends Stack {
  constructor(scope: Construct, id: string, props: BioStackProps) {
    super(scope, id, props);
    const tables = new ContentTables(this, "Tables");
    void tables; // consumed by the API construct in Task 6

    const site = new StaticSite(this, "Site", {
      domainName: props.domainName,
      webDistPath: WEB_DIST_PATH,
    });
    void site;

    new DeployPipeline(this, "Pipeline", { githubOwner: "hodev-x", githubRepo: "bio" });
  }
}
