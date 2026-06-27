/**
 * Thin wrappers over @simplewebauthn/server.
 * All four functions are exported so route handlers can inject fakes in tests.
 *
 * v11 API notes:
 *  - verifyRegistrationResponse returns:
 *      { verified, registrationInfo: { credential: WebAuthnCredential, ... } }
 *    where WebAuthnCredential = { id: Base64URLString, publicKey: Uint8Array, counter, transports? }
 *  - verifyAuthenticationResponse takes:
 *      { ..., credential: WebAuthnCredential } (the full object, not publicKey/counter separately)
 *    and returns { verified, authenticationInfo: { credentialID, newCounter, ... } }
 *  - PublicKeyCredentialCreationOptionsJSON and PublicKeyCredentialRequestOptionsJSON live in
 *    @simplewebauthn/types (not re-exported from @simplewebauthn/server in v11).
 */
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  VerifyRegistrationResponseOpts,
  VerifiedRegistrationResponse,
  VerifyAuthenticationResponseOpts,
  VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";

function rpEnv() {
  return {
    rpID: process.env.RP_ID ?? "localhost",
    rpOrigin: process.env.RP_ORIGIN ?? "http://localhost:3000",
    rpName: process.env.RP_NAME ?? "Bio",
  };
}

/**
 * Generate WebAuthn registration options.
 * Reads RP_ID, RP_ORIGIN, RP_NAME from env at call time (so tests can set them).
 */
export async function generateRegistration(): Promise<Awaited<ReturnType<typeof generateRegistrationOptions>>> {
  const { rpID, rpName } = rpEnv();
  return generateRegistrationOptions({
    rpName,
    rpID,
    userName: "admin",
    userDisplayName: "Admin",
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
  });
}

/**
 * Verify a WebAuthn registration response.
 * expectedChallenge, expectedOrigin, and expectedRPID are required by the caller.
 */
export async function verifyRegistration(
  opts: VerifyRegistrationResponseOpts,
): Promise<VerifiedRegistrationResponse> {
  return verifyRegistrationResponse(opts);
}

/**
 * Generate WebAuthn authentication (login) options.
 */
export async function generateAuthentication(): Promise<Awaited<ReturnType<typeof generateAuthenticationOptions>>> {
  const { rpID } = rpEnv();
  return generateAuthenticationOptions({
    rpID,
    userVerification: "required",
  });
}

/**
 * Verify a WebAuthn authentication response.
 * expectedChallenge, expectedOrigin, expectedRPID, and credential are required by the caller.
 */
export async function verifyAuthentication(
  opts: VerifyAuthenticationResponseOpts,
): Promise<VerifiedAuthenticationResponse> {
  return verifyAuthenticationResponse(opts);
}
