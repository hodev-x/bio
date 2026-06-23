import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";

export interface DeployPipelineProps {
  githubOwner: string;
  githubRepo: string;
  /** Git branch allowed to assume the deploy role. Defaults to "main". */
  branch?: string;
}

export class DeployPipeline extends Construct {
  readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: DeployPipelineProps) {
    super(scope, id);

    const provider = new iam.OpenIdConnectProvider(this, "GitHubOidc", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    const branch = props.branch ?? "main";

    // Exact-match both conditions: the token must be issued for AWS STS (aud) AND
    // originate from a push to the allowed branch of this exact repo (sub). Using
    // StringEquals on the branch ref (not a "repo:owner/name:*" wildcard) keeps PRs
    // from forks and other branches from assuming the production deploy role.
    this.deployRole = new iam.Role(this, "DeployRole", {
      roleName: "bio-github-deploy",
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub":
            `repo:${props.githubOwner}/${props.githubRepo}:ref:refs/heads/${branch}`,
        },
      }),
      description: "Role assumed by GitHub Actions to deploy the bio stack",
    });

    // Broad deploy permissions via CDK's bootstrap roles; the deploy role only needs
    // to assume the CDK deploy/publish roles created by `cdk bootstrap`.
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: ["arn:aws:iam::*:role/cdk-*"],
      }),
    );
  }
}
