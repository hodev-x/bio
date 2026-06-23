import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as path from "node:path";
import type { ContentTables } from "./content-tables.js";

export interface ApiLambdaProps {
  tables: ContentTables;
}

// Public Lambda Web Adapter layer ARN (x86_64). Region is resolved at deploy time.
const LWA_LAYER_ARN = (region: string) =>
  `arn:aws:lambda:${region}:753240598075:layer:LambdaAdapterLayerX86:24`;

export class ApiLambda extends Construct {
  readonly httpApi: apigwv2.HttpApi;
  readonly fn: lambda.Function;

  constructor(scope: Construct, id: string, props: ApiLambdaProps) {
    super(scope, id);
    const { tables } = props;

    // api/dist is produced by `pnpm --filter @bio/api build`; anchor to this file.
    const codePath = path.resolve(import.meta.dirname, "../../../api/dist");

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
      },
    });

    // Read-only grants (writes come in Plan 3).
    tables.profile.grantReadData(this.fn);
    tables.experience.grantReadData(this.fn);
    tables.education.grantReadData(this.fn);
    tables.skills.grantReadData(this.fn);
    tables.projects.grantReadData(this.fn);
    tables.posts.grantReadData(this.fn);

    this.httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      defaultIntegration: new HttpLambdaIntegration("FnIntegration", this.fn),
    });
  }
}
