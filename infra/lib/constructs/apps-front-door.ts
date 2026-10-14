import { Annotations } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { validateAppNames } from "../apps.js";
import { appApiPrefixStripCode, appSpaFallbackCode } from "./app-functions.js";

export interface AppsFrontDoorProps {
  /** "staging" | "prod" — the SSM path segment. */
  envName: string;
  distribution: cloudfront.Distribution;
  /** App names routed under /apps/<name>/; default none. */
  apps?: readonly string[];
}

/**
 * Publishes the distribution's identity under /platform/<env>/front-door/ for
 * app stacks, and routes /apps/<name>/* to each app's bucket and API, whose
 * names the app publishes under /platform/<env>/apps/<name>/. Those values are
 * CloudFormation SSM parameters, resolved at deploy time.
 */
export class AppsFrontDoor extends Construct {
  constructor(scope: Construct, id: string, props: AppsFrontDoorProps) {
    super(scope, id);
    const { distribution, envName } = props;
    const apps = validateAppNames(props.apps ?? []);

    const frontDoor = `/platform/${envName}/front-door`;
    new ssm.StringParameter(this, "DistributionId", {
      parameterName: `${frontDoor}/distribution-id`,
      stringValue: distribution.distributionId,
    });
    new ssm.StringParameter(this, "DistributionArn", {
      parameterName: `${frontDoor}/distribution-arn`,
      stringValue: distribution.distributionArn,
    });
    new ssm.StringParameter(this, "DistributionDomain", {
      parameterName: `${frontDoor}/distribution-domain`,
      stringValue: distribution.distributionDomainName,
    });

    if (apps.length === 0) return;

    const stripPrefix = new cloudfront.Function(this, "ApiPrefixStrip", {
      code: cloudfront.FunctionCode.fromInline(appApiPrefixStripCode()),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });
    const spaFallback = new cloudfront.Function(this, "AppSpaFallback", {
      code: cloudfront.FunctionCode.fromInline(appSpaFallbackCode()),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    for (const name of apps) {
      const app = new Construct(this, name);
      const param = (key: string) =>
        ssm.StringParameter.valueForStringParameter(app, `/platform/${envName}/apps/${name}/${key}`);
      const bucket = s3.Bucket.fromBucketName(app, "SiteBucket", param("site-bucket-name"));

      // CloudFront evaluates behaviors in order: the API pattern must precede the
      // app's catch-all.
      distribution.addBehavior(
        `/apps/${name}/api/*`,
        new origins.HttpOrigin(param("api-domain"), {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
        }),
        {
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          functionAssociations: [{ function: stripPrefix, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
        },
      );
      distribution.addBehavior(`/apps/${name}/*`, origins.S3BucketOrigin.withOriginAccessControl(bucket), {
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [{ function: spaFallback, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      });
    }

    // CDK cannot edit an imported bucket's policy; each app's own stack grants
    // this distribution read access, scoped by AWS:SourceArn.
    Annotations.of(distribution).acknowledgeWarning(
      "@aws-cdk/aws-cloudfront-origins:updateImportedBucketPolicyOac",
      "Each app's stack grants this distribution read access to its bucket.",
    );
  }
}
