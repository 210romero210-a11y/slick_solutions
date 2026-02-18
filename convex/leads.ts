import {
  CreateLeadResponseSchema,
  type CreateLeadResponse,
} from "@slick/contracts";
import { v } from "convex/values";

import { action, mutation, query } from "./_generated/server";
import { requireTenantAccess } from "./model/tenantGuards";

export const createLead = mutation({
  args: {
    tenantId: v.optional(v.id("tenants")),
    email: v.string(),
    vehicleVin: v.string(),
    consentToContact: v.boolean(),
  },
  handler: async (ctx: any, args: any): Promise<CreateLeadResponse> => {
    const effectiveTenantId = await requireTenantAccess(ctx, args.tenantId);

    const now = Date.now();

    const leadId = await ctx.db.insert("leads", {
      ...args,
      tenantId: effectiveTenantId,
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
    tenantId: v.optional(v.id("tenants")),
  },
  handler: async (ctx: any, args: any) => {
    const effectiveTenantId = await requireTenantAccess(ctx, args.tenantId);

    return await ctx.db
      .query("leads")
      .withIndex("by_tenant", (q: any) => q.eq("tenantId", effectiveTenantId))
      .collect();
  },
});

export const healthCheck = action({
  args: {},
  handler: async (): Promise<{ ok: true }> => {
    return { ok: true };
  },
});
