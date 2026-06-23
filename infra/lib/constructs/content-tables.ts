import { RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

/** One on-demand DynamoDB table per content type. */
export class ContentTables extends Construct {
  readonly profile: dynamodb.Table;
  readonly experience: dynamodb.Table;
  readonly education: dynamodb.Table;
  readonly skills: dynamodb.Table;
  readonly projects: dynamodb.Table;
  readonly posts: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const base = (name: string, partitionKey: string) =>
      new dynamodb.Table(this, name, {
        tableName: `bio-${name.toLowerCase()}`,
        partitionKey: { name: partitionKey, type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.RETAIN,
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      });

    this.profile = base("Profile", "id");
    this.experience = base("Experience", "id");
    this.education = base("Education", "id");
    this.skills = base("Skills", "category");
    this.projects = base("Projects", "id");

    this.posts = new dynamodb.Table(this, "Posts", {
      tableName: "bio-posts",
      partitionKey: { name: "slug", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    this.posts.addGlobalSecondaryIndex({
      indexName: "gsi-by-date",
      partitionKey: { name: "type", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "publishedAt", type: dynamodb.AttributeType.STRING },
    });
  }
}
