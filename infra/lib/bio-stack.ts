import * as path from "node:path";
import { Stack, StackProps, Fn, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StaticSite } from "./constructs/static-site.js";
import { ContentTables } from "./constructs/content-tables.js";
import { ApiLambda } from "./constructs/api-lambda.js";

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
    // Auth secrets (jwt key, mcp hash, bootstrap token) are NOT managed by CloudFormation:
    // CFN can't create SecureString params. They're provisioned out-of-band as SecureString by
    // `pnpm --filter @bio/api provision:secrets --env <env>`; the Lambda has IAM read on
    // /bio/<env>/* and fails loud (config.ts) if they're missing/placeholder.
    // Shared secret CloudFront attaches to /api/* requests and the API rejects
    // requests missing it — prevents callers from hitting the Lambda directly,
    // bypassing CloudFront (see api/src/origin-verify.ts's check). Provisioned
    // out-of-band as a plain SSM String by `provision:secrets` (Task 2); the
    // dynamic reference below resolves it at deploy time in both places.
    const originVerifyParam = `/bio/${props.envName}/origin-verify`;

    const api = new ApiLambda(this, "Api", {
      tables,
      envName: props.envName,
      rpId: siteDomain,
      originVerifyParam,
    });
    const apiOrigin = Fn.select(2, Fn.split("/", api.httpApi.apiEndpoint));

    new StaticSite(this, "Site", {
      domainName: siteDomain,
      zoneName: props.zoneDomain,
      includeWww: isProd,
      webDistPath: WEB_DIST_PATH,
      apiOrigin,
      originVerifyParam,
    });
  }
}
