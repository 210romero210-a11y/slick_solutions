# Slick Solutions Baseline

This repository includes:

- Next.js 16 app-router application under `src/app` and tenant flows under `app/`
- Convex backend under `convex/`
- Shared typed contracts package under `packages/contracts`
- Strict TypeScript + linting policy (including no explicit `any`)
- CI workflow validating lint, typecheck, and build

## Implemented Sequential Self-Assessment Flow

- Tenant intake page: `/{tenantSlug}/inspect`
- API endpoint: `POST /api/self-assessments/{tenantSlug}/submit`
- Workflow pipeline stages:
  - portal_started
  - contact_captured
  - vin_captured
  - photos_uploaded
  - agent_damage_triage
  - agent_cost_estimate
  - quote_ready
  - quote_delivered

See `docs/implementation-sequence.md` for sequencing details.
