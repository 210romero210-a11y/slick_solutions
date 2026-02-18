import { v } from "convex/values";

import { mutation } from "../_generated/server";
import { requireAuthenticatedIdentity } from "../model/auth";

export const recordPricingCalculation = mutation({
  args: {
    tenantId: v.id("tenants"),
    quoteId: v.optional(v.id("quotes")),
    inspectionId: v.optional(v.id("inspections")),
    vehicleId: v.optional(v.id("vehicles")),
    input: v.any(),
    output: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
    isDeleted: v.boolean(),
  },
  handler: async (ctx: any, args: any) => {
    await requireAuthenticatedIdentity(ctx);

    return await ctx.db.insert("pricingCalculations", args);
  },
});
