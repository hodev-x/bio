import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as path from "node:path";
import * as fs from "node:fs";
import type { ContentTables } from "./content-tables.js";

export interface ApiLambdaProps {
  tables: ContentTables;
  envName: string;
  rpId: string;
}

// Public Lambda Web Adapter layer ARN (x86_64). Region is resolved at deploy time.
const LWA_LAYER_ARN = (region: string) =>
  `arn:aws:lambda:${region}:753240598075:layer:LambdaAdapterLayerX86:24`;

export class ApiLambda extends Construct {
  readonly httpApi: apigwv2.HttpApi;
  readonly fn: lambda.Function;

  constructor(scope: Construct, id: string, props: ApiLambdaProps) {
    super(scope, id);
    const { tables, envName, rpId } = props;

    // api/dist is produced by `pnpm --filter @bio/api build`; anchor to this file.
    const codePath = path.resolve(import.meta.dirname, "../../../api/dist");

    // Fail fast at synth if the deploy asset is incomplete. The LWA exec wrapper
    // runs /var/task/run.sh, which must be in the bundle alongside the JS entry —
    // otherwise the Lambda 500s at runtime ("/var/task/run.sh: No such file").
    for (const required of ["index.mjs", "run.sh"]) {
      if (!fs.existsSync(path.join(codePath, required))) {
        throw new Error(
          `ApiLambda: missing ${required} in ${codePath}. ` +
            "Run `pnpm --filter @bio/api build` before synth/deploy.",
        );
      }
    }

    this.fn = new lambda.Function(this, "Fn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "run.sh",
      code: lambda.Code.fromAsset(codePath),
      timeout: Duration.seconds(15),
      memorySize: 512,
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          "LwaLayer",
          LWA_LAYER_ARN(this.node.tryGetContext("region") ?? "us-east-1"),
        ),
      ],
      environment: {
        AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
        AWS_LWA_PORT: "8080",
        PORT: "8080",
        TABLE_PROFILE: tables.profile.tableName,
        TABLE_EXPERIENCE: tables.experience.tableName,
        TABLE_EDUCATION: tables.education.tableName,
        TABLE_SKILLS: tables.skills.tableName,
        TABLE_PROJECTS: tables.projects.tableName,
        TABLE_POSTS: tables.posts.tableName,
        TABLE_CREDENTIALS: tables.credentials.tableName,
        TABLE_AUTH_CHALLENGES: tables.authChallenges.tableName,
        SSM_PREFIX: `/bio/${envName}`,
        RP_ID: rpId,
        RP_ORIGIN: `https://${rpId}`,
        RP_NAME: "Daniel Hodeta",
      },
    });

    // Content tables need read+write (write routes: PutItem/UpdateItem/DeleteItem).
    tables.profile.grantReadWriteData(this.fn);
    tables.experience.grantReadWriteData(this.fn);
    tables.education.grantReadWriteData(this.fn);
    tables.skills.grantReadWriteData(this.fn);
    tables.projects.grantReadWriteData(this.fn);
    tables.posts.grantReadWriteData(this.fn);

    // Auth tables need read+write (challenge create/delete, credential create/update).
    tables.credentials.grantReadWriteData(this.fn);
    tables.authChallenges.grantReadWriteData(this.fn);

    // SSM: allow reading auth secrets under the env prefix.
    this.fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter", "ssm:GetParameters"],
        resources: [`arn:aws:ssm:*:*:parameter/bio/${envName}/*`],
      }),
    );

    this.httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      defaultIntegration: new HttpLambdaIntegration("FnIntegration", this.fn),
    });
  }
}
