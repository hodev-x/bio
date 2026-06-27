import { Construct } from "constructs";
import * as ssm from "aws-cdk-lib/aws-ssm";

export interface AuthSecretsProps {
  envName: string;
}

/**
 * SSM parameters backing auth. CloudFormation can't create SecureString params, so these are
 * created as placeholders and overwritten (as SecureString) by the provision scripts in Task 9:
 *   - jwt-signing-key         : HMAC key for signing/verifying JWTs
 *   - mcp-client-secret-hash  : scrypt hash of the MCP BIO_API_KEY
 *   - passkey-bootstrap-token : one-time token allowing the first passkey registration
 */
export class AuthSecrets extends Construct {
  readonly paramPrefix: string;

  constructor(scope: Construct, id: string, props: AuthSecretsProps) {
    super(scope, id);
    this.paramPrefix = `/bio/${props.envName}`;
    for (const name of ["jwt-signing-key", "mcp-client-secret-hash", "passkey-bootstrap-token"]) {
      new ssm.StringParameter(this, name, {
        parameterName: `${this.paramPrefix}/${name}`,
        stringValue: "PLACEHOLDER-set-by-provision-script",
      });
    }
  }
}
