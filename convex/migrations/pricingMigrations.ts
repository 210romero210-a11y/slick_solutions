import { v } from "convex/values";

import { mutation } from "../_generated/server";
import { requireAuthenticatedIdentity } from "../model/auth";

const PRICING_MIGRATION_IDS = [
  "2026-02-pricing-rules-rule-version-baseline",
  "2026-02-quote-snapshots-seed-rule-metadata-version",
  "2026-03-pricing-coefficients-baseline-shape",
  "2026-03-quote-snapshots-baseline-shape-and-backfill",
  "2026-03-ai-signal-normalization-baseline",
] as const;

type PricingMigrationId = (typeof PRICING_MIGRATION_IDS)[number];

const migrationCatalog: Record<PricingMigrationId, { id: PricingMigrationId; description: string }> = {
  "2026-02-pricing-rules-rule-version-baseline": {
    id: "2026-02-pricing-rules-rule-version-baseline",
    description: "Backfill pricingRules.ruleVersion with value 1 when missing.",
  },
  "2026-02-quote-snapshots-seed-rule-metadata-version": {
    id: "2026-02-quote-snapshots-seed-rule-metadata-version",
    description: "Seed quoteSnapshots.ruleMetadata.ruleVersion with fallback value 1 when absent.",
  },
  "2026-03-pricing-coefficients-baseline-shape": {
    id: "2026-03-pricing-coefficients-baseline-shape",
    description:
      "Normalize pricingCoefficients baseline fields (version, isActive, effectiveFrom) to support additive schema evolution.",
  },
  "2026-03-quote-snapshots-baseline-shape-and-backfill": {
    id: "2026-03-quote-snapshots-baseline-shape-and-backfill",
    description:
      "Backfill quoteSnapshots to a baseline structure and create baseline snapshots for legacy quotes that have no snapshot trail.",
  },
  "2026-03-ai-signal-normalization-baseline": {
    id: "2026-03-ai-signal-normalization-baseline",
    description:
      "Normalize historical aiSignals and aiSignalEvents records so signal normalization lineage follows a single baseline format.",
  },
};

export const listPricingMigrations = mutation({
  args: {},
  handler: async () => {
    return PRICING_MIGRATION_IDS.map((id) => migrationCatalog[id]);
  },
});

export const runPricingMigration = mutation({
  args: {
    migrationId: v.union(...PRICING_MIGRATION_IDS.map((id) => v.literal(id))),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: { migrationId: PricingMigrationId; dryRun?: boolean }) => {
    await requireAuthenticatedIdentity(ctx);

    if (args.migrationId === "2026-02-pricing-rules-rule-version-baseline") {
      const rules = await ctx.db.query("pricingRules").collect();
      const toPatch = rules.filter((rule: any) => typeof rule.ruleVersion !== "number");

      if (!args.dryRun) {
        for (const rule of toPatch) {
          await ctx.db.patch(rule._id, {
            ruleVersion: 1,
            updatedAt: Date.now(),
          });
        }
      }

      return {
        migrationId: args.migrationId,
        dryRun: Boolean(args.dryRun),
        scanned: rules.length,
        patched: toPatch.length,
      };
    }

    if (args.migrationId === "2026-02-quote-snapshots-seed-rule-metadata-version") {
      const snapshots = await ctx.db.query("quoteSnapshots").collect();
      const toPatch = snapshots.filter((snapshot: any) => {
        const metadata = snapshot.ruleMetadata;
        if (!metadata || typeof metadata !== "object") {
          return true;
        }
        return typeof metadata.ruleVersion !== "number";
      });

      if (!args.dryRun) {
        for (const snapshot of toPatch) {
          const metadata = snapshot.ruleMetadata && typeof snapshot.ruleMetadata === "object" ? snapshot.ruleMetadata : {};
          await ctx.db.patch(snapshot._id, {
            ruleMetadata: {
              ...metadata,
              ruleVersion: 1,
            },
          });
        }
      }

      return {
        migrationId: args.migrationId,
        dryRun: Boolean(args.dryRun),
        scanned: snapshots.length,
        patched: toPatch.length,
      };
    }

    if (args.migrationId === "2026-03-pricing-coefficients-baseline-shape") {
      const now = Date.now();
      const coefficients = await ctx.db.query("pricingCoefficients").collect();
      const toPatch = coefficients.filter(
        (coefficient: any) =>
          typeof coefficient.version !== "number" ||
          typeof coefficient.isActive !== "boolean" ||
          typeof coefficient.effectiveFrom !== "number",
      );

      if (!args.dryRun) {
        for (const coefficient of toPatch) {
          await ctx.db.patch(coefficient._id, {
            version: typeof coefficient.version === "number" ? coefficient.version : 1,
            isActive: typeof coefficient.isActive === "boolean" ? coefficient.isActive : true,
            effectiveFrom:
              typeof coefficient.effectiveFrom === "number"
                ? coefficient.effectiveFrom
                : typeof coefficient.createdAt === "number"
                  ? coefficient.createdAt
                  : now,
            updatedAt: now,
          });
        }
      }

      return {
        migrationId: args.migrationId,
        dryRun: Boolean(args.dryRun),
        scanned: coefficients.length,
        patched: toPatch.length,
      };
    }

    if (args.migrationId === "2026-03-quote-snapshots-baseline-shape-and-backfill") {
      const now = Date.now();
      const [quotes, snapshots] = await Promise.all([
        ctx.db.query("quotes").collect(),
        ctx.db.query("quoteSnapshots").collect(),
      ]);

      const snapshotQuoteIds = new Set(snapshots.map((snapshot: any) => `${snapshot.quoteId}`));

      const toPatch = snapshots.filter((snapshot: any) => {
        const metadata = snapshot.ruleMetadata;
        return (
          typeof snapshot.pricingRuleVersion !== "number" ||
          !snapshot.coefficientSnapshot ||
          !snapshot.rawAiOutput ||
          !snapshot.vinSignals ||
          !Array.isArray(snapshot.calculationTrace) ||
          !snapshot.pricingInputPayload ||
          !snapshot.normalizedContext ||
          !metadata ||
          typeof metadata !== "object" ||
          typeof metadata.ruleVersion !== "number"
        );
      });

      const quotesWithoutSnapshots = quotes.filter((quote: any) => !snapshotQuoteIds.has(`${quote._id}`));

      if (!args.dryRun) {
        for (const snapshot of toPatch) {
          const metadata = snapshot.ruleMetadata && typeof snapshot.ruleMetadata === "object" ? snapshot.ruleMetadata : {};
          await ctx.db.patch(snapshot._id, {
            pricingRuleVersion: typeof snapshot.pricingRuleVersion === "number" ? snapshot.pricingRuleVersion : 1,
            coefficientSnapshot:
              snapshot.coefficientSnapshot && typeof snapshot.coefficientSnapshot === "object"
                ? snapshot.coefficientSnapshot
                : {},
            rawAiOutput: snapshot.rawAiOutput && typeof snapshot.rawAiOutput === "object" ? snapshot.rawAiOutput : {},
            vinSignals: snapshot.vinSignals && typeof snapshot.vinSignals === "object" ? snapshot.vinSignals : {},
            calculationTrace: Array.isArray(snapshot.calculationTrace) ? snapshot.calculationTrace : [],
            pricingInputPayload:
              snapshot.pricingInputPayload && typeof snapshot.pricingInputPayload === "object"
                ? snapshot.pricingInputPayload
                : {},
            normalizedContext:
              snapshot.normalizedContext && typeof snapshot.normalizedContext === "object"
                ? snapshot.normalizedContext
                : {},
            ruleMetadata: {
              ...metadata,
              ruleVersion: typeof metadata.ruleVersion === "number" ? metadata.ruleVersion : 1,
            },
            computedLineItems: Array.isArray(snapshot.computedLineItems) ? snapshot.computedLineItems : [],
            computedTotals:
              snapshot.computedTotals && typeof snapshot.computedTotals === "object"
                ? snapshot.computedTotals
                : {
                    subtotalCents: 0,
                    taxCents: 0,
                    totalCents: 0,
                    currency: "usd",
                  },
            actorSource: snapshot.actorSource ?? "migration_baseline",
            snapshotAt: typeof snapshot.snapshotAt === "number" ? snapshot.snapshotAt : now,
          });
        }

        for (const quote of quotesWithoutSnapshots) {
          await ctx.db.insert("quoteSnapshots", {
            tenantId: quote.tenantId,
            quoteId: quote._id,
            pricingRuleVersion: 1,
            coefficientSnapshot: {},
            rawAiOutput: {},
            vinSignals: {},
            calculationTrace: [],
            snapshotEvent: "quote_created",
            pricingInputPayload: {},
            normalizedContext: {},
            ruleMetadata: {
              ruleVersion: 1,
              source: "migration_backfill",
            },
            computedLineItems: Array.isArray(quote.lineItems) ? quote.lineItems : [],
            computedTotals: {
              subtotalCents: quote.subtotalCents,
              taxCents: quote.taxCents,
              totalCents: quote.totalCents,
              currency: quote.currency,
            },
            snapshotAt: typeof quote.createdAt === "number" ? quote.createdAt : now,
            actorSource: "migration_backfill",
          });
        }
      }

      return {
        migrationId: args.migrationId,
        dryRun: Boolean(args.dryRun),
        scannedQuotes: quotes.length,
        scannedSnapshots: snapshots.length,
        patchedSnapshots: toPatch.length,
        insertedSnapshots: quotesWithoutSnapshots.length,
      };
    }

    const now = Date.now();
    const [signals, signalEvents] = await Promise.all([ctx.db.query("aiSignals").collect(), ctx.db.query("aiSignalEvents").collect()]);

    const signalsToPatch = signals.filter(
      (signal: any) =>
        !signal.normalizedPayload ||
        typeof signal.normalizedPayload !== "object" ||
        typeof signal.validationStatus !== "string" ||
        typeof signal.validatedAt !== "number",
    );

    const eventsToPatch = signalEvents.filter(
      (event: any) =>
        !event.normalizedPayload ||
        typeof event.normalizedPayload !== "object" ||
        typeof event.eventType !== "string" ||
        typeof event.createdAt !== "number",
    );

    if (!args.dryRun) {
      for (const signal of signalsToPatch) {
        await ctx.db.patch(signal._id, {
          normalizedPayload:
            signal.normalizedPayload && typeof signal.normalizedPayload === "object"
              ? signal.normalizedPayload
              : {
                  normalized: false,
                  source: "migration_baseline",
                  payload: signal.normalizedPayload ?? null,
                },
          validationStatus:
            signal.validationStatus === "validated" ||
            signal.validationStatus === "needs_review" ||
            signal.validationStatus === "rejected"
              ? signal.validationStatus
              : "validated",
          validatedAt: typeof signal.validatedAt === "number" ? signal.validatedAt : signal.createdAt ?? now,
          updatedAt: now,
        });
      }

      for (const event of eventsToPatch) {
        await ctx.db.patch(event._id, {
          eventType:
            event.eventType === "captured" ||
            event.eventType === "normalized" ||
            event.eventType === "validated" ||
            event.eventType === "replayed"
              ? event.eventType
              : "normalized",
          normalizedPayload:
            event.normalizedPayload && typeof event.normalizedPayload === "object"
              ? event.normalizedPayload
              : {
                  normalized: false,
                  source: "migration_baseline",
                  payload: event.rawPayload ?? null,
                },
          createdAt: typeof event.createdAt === "number" ? event.createdAt : now,
        });
      }
    }

    return {
      migrationId: args.migrationId,
      dryRun: Boolean(args.dryRun),
      scannedSignals: signals.length,
      scannedSignalEvents: signalEvents.length,
      patchedSignals: signalsToPatch.length,
      patchedSignalEvents: eventsToPatch.length,
    };
  },
});
