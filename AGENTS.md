# AGENTS.md — bio

Conventions and commands for working in this repo (for humans and AI coding agents).
Detailed design specs and plans live in a separate private hub, not here.

## What this is
A headless personal site: a React shell that fetches all content from an API, hosted on AWS.

```
web/     React 19 + Vite + TypeScript (static SPA; fetches content from /api)
api/     Fastify 5 on AWS Lambda (via the Lambda Web Adapter; esbuild bundle)
infra/   AWS CDK (TypeScript, ESM, run via tsx)
```

## Setup
- **Node ≥ 22**, **pnpm** (pinned via `packageManager`; `corepack enable pnpm`).
- `pnpm install` at the root (pnpm workspaces).

## Commands
| | |
|---|---|
| `pnpm --filter @bio/web dev` | run the frontend locally |
| `pnpm --filter @bio/api dev` | run the API locally (Fastify on :8080) |
| `pnpm -r build` | build web + api |
| `pnpm --filter @bio/api test` / `--filter @bio/infra test` | unit tests (vitest) |
| `pnpm --filter @bio/web typecheck` / `@bio/api typecheck` | type-check |

## Conventions
- **ESM everywhere** (`"type":"module"`, NodeNext) — local relative imports use explicit `.js`.
- **TDD**: CDK assertions for infra, `aws-sdk-client-mock` for data, injected deps for hard-to-test
  boundaries. Small, focused files; injectable dependencies in API handlers.
- Conventional commits; frequent and small.
- The Lambda runtime is **node20** (the build/CI environment is node22).

## Deploy (CI/CD)
- Push to `main` → GitHub Actions deploys **staging** (`staging.danielhodeta.com`) via keyless
  GitHub OIDC (no stored AWS keys), running `cdk deploy` for the foundation + staging stacks.
- Production is a **manual, gated** workflow (`deploy-prod.yml`, `workflow_dispatch`).
- Prod's apex/www DNS records are not managed by CloudFormation: `infra/scripts/cutover-dns.sh`
  (`preflight`, `snapshot`, `prepare`, `apply`, `rollback`) switches them in one Route53 change batch. The prod
  stack outputs `DistributionDomainName`, the value to pass to it. Run its `prepare` step before the
  prod deploy so the certificate can include www.
- Infra is two environments from one codebase: `BioStack-staging` / `BioStack-prod`.
- The SSM parameter `/bio/<env>/origin-verify` must exist before `cdk deploy` for that env
  (`pnpm --filter @bio/api exec tsx scripts/provision-secrets.ts --env <env> --only origin-verify`);
  the stack resolves it at deploy time.

## Notes
- No secrets in this repo — runtime secrets live in AWS SSM; CI auth is keyless OIDC.
- `api/dist` and `cdk.out` are build artifacts (gitignored). The Lambda asset must include `run.sh`
  (the construct validates this at synth).
