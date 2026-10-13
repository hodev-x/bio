import { Construct } from "constructs";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as ssm from "aws-cdk-lib/aws-ssm";

export interface AppsFrontDoorProps {
  /** "staging" | "prod" — the SSM path segment. */
  envName: string;
  distribution: cloudfront.Distribution;
}

/** Publishes the distribution's identity under /platform/<env>/front-door/ for app stacks. */
export class AppsFrontDoor extends Construct {
  constructor(scope: Construct, id: string, props: AppsFrontDoorProps) {
    super(scope, id);
    const { distribution, envName } = props;

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
  }
}
