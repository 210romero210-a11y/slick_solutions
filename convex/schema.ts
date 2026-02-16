import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  leads: defineTable({
    tenantId: v.string(),
    email: v.string(),
    vehicleVin: v.string(),
    consentToContact: v.boolean(),
    status: v.union(v.literal("accepted"), v.literal("rejected")),
    reason: v.optional(v.string())
  }).index("by_tenant", ["tenantId"])
});
