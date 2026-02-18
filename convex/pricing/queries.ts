import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireAuthenticatedIdentity } from "../model/auth";
import { buildPricingContext } from "./contextBuilder";

const pricingContextArgs = {
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

export const getTenantBySlug = query({
  args: {
    tenantSlug: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    await requireAuthenticatedIdentity(ctx);

    return await ctx.db
      .query("tenants")
      .withIndex("by_slug", (q: any) => q.eq("slug", args.tenantSlug))
      .first();
  },
});

export const compilePricingContext = query({
  args: pricingContextArgs,
  handler: async (ctx: any, args: any) => {
    await requireAuthenticatedIdentity(ctx);
    return await buildPricingContext(ctx, args);
  },
});
