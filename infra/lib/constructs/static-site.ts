import { RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as path from "node:path";
import { spaFallbackCode } from "./spa-fallback-function.js";

export interface StaticSiteProps {
  /** Primary record + ACM CN, e.g. "staging.danielhodeta.com" or "danielhodeta.com". */
  domainName: string;
  /** Hosted zone to look up; defaults to domainName. */
  zoneName?: string;
  /** Also create www.<domainName> record + SAN; default false. */
  includeWww?: boolean;
  /** Path to the built web assets (e.g. ../web/dist). */
  webDistPath: string;
  /** Domain of the HTTP API origin (e.g. xxxx.execute-api.us-east-1.amazonaws.com). */
  apiOrigin?: string;
  /** SSM parameter NAME (not value) holding the shared origin-verify secret, e.g. "/bio/staging/origin-verify". */
  originVerifyParam?: string;
  /** Default true. Prod passes false: its apex/www records are switched by infra/scripts/cutover-dns.sh, not CloudFormation. */
  createDnsRecords?: boolean;
}

export class StaticSite extends Construct {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: StaticSiteProps) {
    super(scope, id);
    const { domainName } = props;
    const zoneName = props.zoneName ?? domainName;
    const includeWww = props.includeWww ?? false;
    const wwwName = `www.${domainName}`;

    const domainNames = includeWww ? [domainName, wwwName] : [domainName];

    const zone = route53.HostedZone.fromLookup(this, "Zone", { domainName: zoneName });

    this.bucket = new s3.Bucket(this, "Bucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // CloudFront requires the cert in us-east-1; the stack is deployed there.
    const certificate = new acm.Certificate(this, "Cert", {
      domainName,
      ...(includeWww ? { subjectAlternativeNames: [wwwName] } : {}),
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const additionalBehaviors: Record<string, cloudfront.BehaviorOptions> = {};
    if (props.apiOrigin) {
      additionalBehaviors["/api/*"] = {
        origin: new origins.HttpOrigin(
          props.apiOrigin,
          props.originVerifyParam
            ? { customHeaders: { "x-origin-verify": `{{resolve:ssm:${props.originVerifyParam}}}` } }
            : {},
        ),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      };
    }

    // Client-side routes have no file extension; a CloudFront Function on the
    // default behavior rewrites those to /index.html so the SPA router can take
    // over. Scoped to this behavior only (not distribution-wide error responses)
    // so /api/* 404s stay real 404s.
    const fallback = new cloudfront.Function(this, "SpaFallback", {
      code: cloudfront.FunctionCode.fromInline(spaFallbackCode()),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      domainNames,
      certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [{ function: fallback, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors,
    });

    if (props.createDnsRecords ?? true) {
      const target = route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution),
      );
      new route53.ARecord(this, "PrimaryA", { zone, target, recordName: domainName });
      if (includeWww) {
        new route53.ARecord(this, "WwwA", { zone, target, recordName: wwwName });
      }
    }

    // index.html references content-hashed asset filenames, so it must never
    // be cached as long as they are: a browser holding a cached index.html
    // could reference assets a later deploy has pruned. Split the deploy so
    // index.html gets short-lived caching and the hashed assets get
    // long-lived immutable caching.
    const webAssets = s3deploy.Source.asset(path.resolve(props.webDistPath));

    const deployAssets = new s3deploy.BucketDeployment(this, "DeployAssets", {
      sources: [webAssets],
      destinationBucket: this.bucket,
      exclude: ["index.html"],
      cacheControl: [s3deploy.CacheControl.fromString("public, max-age=31536000, immutable")],
    });

    const deployIndex = new s3deploy.BucketDeployment(this, "DeployIndex", {
      sources: [webAssets],
      destinationBucket: this.bucket,
      exclude: ["*"],
      include: ["index.html"],
      // This deployment's source view is scoped to index.html alone; pruning
      // here would delete every hashed asset DeployAssets just uploaded.
      prune: false,
      cacheControl: [s3deploy.CacheControl.fromString("no-cache")],
      distribution: this.distribution,
      distributionPaths: ["/*"],
    });
    // Upload the hashed assets before publishing the index.html that
    // references them.
    deployIndex.node.addDependency(deployAssets);
  }
}
