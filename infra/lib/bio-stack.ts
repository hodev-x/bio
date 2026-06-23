import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StaticSite } from "./constructs/static-site.js";

export interface BioStackProps extends StackProps {
  domainName: string;
}

export class BioStack extends Stack {
  constructor(scope: Construct, id: string, props: BioStackProps) {
    super(scope, id, props);
    const site = new StaticSite(this, "Site", {
      domainName: props.domainName,
      webDistPath: "../web/dist",
    });
    void site;
  }
}
