import {
  CreateLeadRequestSchema,
  CreateLeadResponseSchema,
  type CreateLeadResponse
} from "@slick/contracts";
import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";

export const createLead = mutation({
  args: {
    tenantId: v.string(),
    email: v.string(),
    vehicleVin: v.string(),
    consentToContact: v.boolean()
  },
  handler: async (ctx, args): Promise<CreateLeadResponse> => {
    const parsed = CreateLeadRequestSchema.parse(args);

    const leadId = await ctx.db.insert("leads", {
      ...parsed,
      status: "accepted"
    });

    return CreateLeadResponseSchema.parse({
      id: leadId,
      status: "accepted"
    });
  }
});

export const listLeadsForTenant = query({
  args: {
    tenantId: v.string()
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("leads")
      .withIndex("by_tenant", (q) => q.eq("tenantId", String(args.tenantId)))
      .collect();
  }
});

export const healthCheck = action({
  args: {},
  handler: async (): Promise<{ ok: true }> => {
    return { ok: true };
  }
});
