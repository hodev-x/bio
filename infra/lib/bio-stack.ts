import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface BioStackProps extends StackProps {
  domainName: string;
}

export class BioStack extends Stack {
  constructor(scope: Construct, id: string, props: BioStackProps) {
    super(scope, id, props);
    // constructs added in later tasks
  }
}
