import {
  CreateLeadResponseSchema,
  type CreateLeadResponse,
} from "@slick/contracts";
import { v } from "convex/values";

import { action, mutation, query } from "./_generated/server";
import { requireAuthenticatedIdentity } from "./model/auth";

export const createLead = mutation({
  args: {
    tenantId: v.id("tenants"),
    email: v.string(),
    vehicleVin: v.string(),
    consentToContact: v.boolean(),
  },
  handler: async (ctx: any, args: any): Promise<CreateLeadResponse> => {
    await requireAuthenticatedIdentity(ctx);

    const now = Date.now();

    const leadId = await ctx.db.insert("leads", {
      ...args,
      status: "accepted",
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });

    return CreateLeadResponseSchema.parse({
      id: leadId,
      status: "accepted",
    });
  },
});

export const listLeadsForTenant = query({
  args: {
    tenantId: v.id("tenants"),
  },
  handler: async (ctx: any, args: any) => {
    await requireAuthenticatedIdentity(ctx);

    return await ctx.db
      .query("leads")
      .withIndex("by_tenant", (q: any) => q.eq("tenantId", args.tenantId))
      .collect();
  },
});

export const healthCheck = action({
  args: {},
  handler: async (): Promise<{ ok: true }> => {
    return { ok: true };
  },
});
