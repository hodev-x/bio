import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";

export interface DeployPipelineProps {
  githubOwner: string;
  githubRepo: string;
  /** Git branch allowed to assume the deploy role. Defaults to "main". */
  branch?: string;
  /** GitHub Environment used by the gated prod workflow. Defaults to "production". */
  environment?: string;
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
    const environment = props.environment ?? "production";
    const repo = `${props.githubOwner}/${props.githubRepo}`;

    // Exact-match both conditions: the token must be issued for AWS STS (aud) AND
    // originate from this exact repo (sub). GitHub emits two different `sub` forms:
    //   - push to the branch (staging deploy)      -> repo:<repo>:ref:refs/heads/<branch>
    //   - environment-gated prod workflow          -> repo:<repo>:environment:<environment>
    // Both are allowed (a StringEquals value list is an OR). We still avoid a
    // "repo:<repo>:*" wildcard, so PRs, forks, and other branches can't assume the role.
    this.deployRole = new iam.Role(this, "DeployRole", {
      roleName: "bio-github-deploy",
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": [
            `repo:${repo}:ref:refs/heads/${branch}`,
            `repo:${repo}:environment:${environment}`,
          ],
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
