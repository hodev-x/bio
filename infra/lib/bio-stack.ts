import * as path from "node:path";
import { Stack, StackProps, Fn, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StaticSite } from "./constructs/static-site.js";
import { ContentTables } from "./constructs/content-tables.js";
import { ApiLambda } from "./constructs/api-lambda.js";
import { AuthSecrets } from "./constructs/auth-secrets.js";

export interface BioStackProps extends StackProps {
  envName: string;     // "staging" | "prod"
  zoneDomain: string;  // "danielhodeta.com"
}

// Anchor the web build path to this file's location so it resolves the same
// regardless of the process working directory at synth/deploy time.
// infra/lib -> ../../web/dist == <repo>/web/dist
const WEB_DIST_PATH = path.resolve(import.meta.dirname, "../../web/dist");

export class BioStack extends Stack {
  constructor(scope: Construct, id: string, props: BioStackProps) {
    super(scope, id, props);
    const isProd = props.envName === "prod";
    const siteDomain = isProd ? props.zoneDomain : `${props.envName}.${props.zoneDomain}`;

    const tables = new ContentTables(this, "Tables", {
      tableNamePrefix: `bio-${props.envName}`,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    new AuthSecrets(this, "Auth", { envName: props.envName });
    const api = new ApiLambda(this, "Api", { tables, envName: props.envName, rpId: siteDomain });
    const apiOrigin = Fn.select(2, Fn.split("/", api.httpApi.apiEndpoint));

    const site = new StaticSite(this, "Site", {
      domainName: siteDomain,
      zoneName: props.zoneDomain,
      includeWww: isProd,
      webDistPath: WEB_DIST_PATH,
      apiOrigin,
    });
    void site;
  }
}
