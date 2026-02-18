# Pricing snapshot and migration operations

This runbook defines how quote pricing artifacts are persisted and how pricing schema changes are migrated without losing reproducibility.

## Snapshot model (`quoteSnapshots`)

A snapshot is written for every quote lifecycle step:

- `quote_created`
- `quote_revised`
- `quote_finalized`

Each snapshot stores:

- tenant + quote identity (`tenantId`, `quoteId`)
- immutable pricing inputs (`pricingInputPayload`)
- normalized decision context (`normalizedContext`)
- rule metadata including rule/version details (`ruleMetadata`)
- computed line items and totals (`computedLineItems`, `computedTotals`)
- timestamp and actor/source (`snapshotAt`, `actorId`, `actorSource`)

## Write path (quote lifecycle)

Use the quote workflow mutations in `convex/quotes.ts`:

1. `createQuote` inserts `quotes` row and appends `quote_created` snapshot.
2. `reviseQuote` patches quote totals/items and appends `quote_revised` snapshot.
3. `finalizeQuote` transitions quote status, records transition event, and appends `quote_finalized` snapshot.

Operational guidance:

- Do not patch `quoteSnapshots` records except through explicit migrations.
- Treat snapshots as audit artifacts that are append-only.
- Always pass `pricingInputPayload`, `normalizedContext`, and `ruleMetadata` from the caller.

## Replay and explain queries

Use read endpoints in `convex/quotes.ts`:

- `replayQuote`: returns quote + full ordered snapshot trail for deterministic replay.
- `explainQuotePrice`: returns latest snapshot context to answer “why this price”.

## Migration workflow for pricing schema changes

Migration entry points are in `convex/migrations/pricingMigrations.ts`.

### Available migration actions

- `listPricingMigrations`: returns registered migration IDs + descriptions.
- `runPricingMigration`: executes a migration by ID with optional `dryRun`.

### Baseline migration examples

1. `2026-02-pricing-rules-rule-version-baseline`
   - Backfills new `pricingRules.ruleVersion` field to `1` if missing.
2. `2026-02-quote-snapshots-seed-rule-metadata-version`
   - Ensures historic snapshots contain `ruleMetadata.ruleVersion` fallback.

### Standard operating procedure

1. Deploy schema changes first (fields should be optional until migration completes).
2. Run migration in `dryRun` mode and capture record counts.
3. Run migration without `dryRun`.
4. Re-run in `dryRun` mode to verify `patched: 0`.
5. Update this document with new migration ID, purpose, and rollback notes.

## Rollback strategy

- Snapshot table is append-only: rollback is done by correcting forward with a new snapshot event.
- For field migrations, add a compensating migration ID rather than editing historic IDs.
