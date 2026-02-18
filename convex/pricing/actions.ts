import { v } from "convex/values";

import { action } from "../_generated/server";
import { requireAuthenticatedIdentity } from "../model/auth";
import { buildPricingContext } from "./contextBuilder";
import { computeQuotePricing } from "./ruleEvaluator";

const pricingCalculationArgs = {
  tenantId: v.id("tenants"),
  quoteId: v.optional(v.id("quotes")),
  inspectionId: v.optional(v.id("inspections")),
  vehicleId: v.optional(v.id("vehicles")),
  vin: v.optional(v.string()),
  services: v.array(
    v.object({
      code: v.string(),
      description: v.optional(v.string()),
      basePriceCents: v.number(),
      quantity: v.number(),
    }),
  ),
  difficultyScore: v.optional(v.number()),
  demandMultiplier: v.optional(v.number()),
  vehicleSizeMultiplier: v.optional(v.number()),
  addOnsCents: v.optional(v.number()),
  discountCents: v.optional(v.number()),
} as const;

export const calculateQuotePricing = action({
  args: pricingCalculationArgs,
  handler: async (ctx: any, args: any) => {
    await requireAuthenticatedIdentity(ctx);

    const compiledContext = await buildPricingContext(ctx, args);
    const computed = computeQuotePricing(compiledContext);

    const now = Date.now();

    const calculationId = await ctx.runMutation("pricing/mutations:recordPricingCalculation", {
      tenantId: args.tenantId,
      quoteId: args.quoteId,
      inspectionId: compiledContext.inspectionId,
      vehicleId: compiledContext.vehicleId,
      input: {
        ...args,
        compiledContext,
      },
      output: computed,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });

    return {
      calculationId,
      tenantId: args.tenantId,
      quoteId: args.quoteId,
      inspectionId: compiledContext.inspectionId,
      vehicleId: compiledContext.vehicleId,
      vehicle: compiledContext.vehicle,
      ...computed,
    };
  },
});
