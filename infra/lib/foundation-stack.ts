import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { DeployPipeline } from "./constructs/pipeline.js";

export class BioFoundationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    new DeployPipeline(this, "Pipeline", { githubOwner: "hodev-x", githubRepo: "bio" });
  }
}
