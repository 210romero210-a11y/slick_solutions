import { v } from "convex/values";

import { mutation } from "../_generated/server";
import { requireAuthenticatedIdentity } from "../model/auth";

const PRICING_MIGRATION_IDS = [
  "2026-02-pricing-rules-rule-version-baseline",
  "2026-02-quote-snapshots-seed-rule-metadata-version",
] as const;

type PricingMigrationId = (typeof PRICING_MIGRATION_IDS)[number];

export const listPricingMigrations = mutation({
  args: {},
  handler: async () => {
    return [
      {
        id: "2026-02-pricing-rules-rule-version-baseline",
        description: "Backfill pricingRules.ruleVersion with value 1 when missing.",
      },
      {
        id: "2026-02-quote-snapshots-seed-rule-metadata-version",
        description: "Seed quoteSnapshots.ruleMetadata.ruleVersion with fallback value 1 when absent.",
      },
    ];
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
  },
});
