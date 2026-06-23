# bio

Headless personal site for Daniel Hodeta. React shell + Fastify/Lambda API + DynamoDB,
hosted on AWS. Public repo — no content or secrets live here.

- `web/`   React 19 + Vite frontend (static, fetches all content from `/api`)
- `api/`   Fastify app on Lambda (Web Adapter) backed by DynamoDB
- `infra/` AWS CDK (TypeScript)
- `docs/`  Specs and plans

See `docs/superpowers/specs/` for the design.
