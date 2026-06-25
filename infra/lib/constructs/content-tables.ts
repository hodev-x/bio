import { RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export interface ContentTablesProps {
  /** Prefix for all table names, e.g. "bio-staging". */
  tableNamePrefix: string;
  /** Removal policy for all tables; defaults to RemovalPolicy.RETAIN. */
  removalPolicy?: RemovalPolicy;
}

/** One on-demand DynamoDB table per content type. */
export class ContentTables extends Construct {
  readonly profile: dynamodb.Table;
  readonly experience: dynamodb.Table;
  readonly education: dynamodb.Table;
  readonly skills: dynamodb.Table;
  readonly projects: dynamodb.Table;
  readonly posts: dynamodb.Table;

  constructor(scope: Construct, id: string, props: ContentTablesProps) {
    super(scope, id);

    const removal = props.removalPolicy ?? RemovalPolicy.RETAIN;
    const prefix = props.tableNamePrefix;

    const base = (name: string, partitionKey: string) =>
      new dynamodb.Table(this, name, {
        tableName: `${prefix}-${name.toLowerCase()}`,
        partitionKey: { name: partitionKey, type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: removal,
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      });

    this.profile = base("Profile", "id");
    this.experience = base("Experience", "id");
    this.education = base("Education", "id");
    this.skills = base("Skills", "category");
    this.projects = base("Projects", "id");

    this.posts = new dynamodb.Table(this, "Posts", {
      tableName: `${prefix}-posts`,
      partitionKey: { name: "slug", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    this.posts.addGlobalSecondaryIndex({
      indexName: "gsi-by-date",
      partitionKey: { name: "type", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "publishedAt", type: dynamodb.AttributeType.STRING },
    });
  }
}
