import { v } from "convex/values";

export const auditFields = {
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.optional(v.id("users")),
  updatedBy: v.optional(v.id("users")),
  isDeleted: v.boolean(),
  deletedAt: v.optional(v.number()),
  deletedBy: v.optional(v.id("users")),
  deleteReason: v.optional(v.string()),
};

export const tenantScopedFields = {
  tenantId: v.id("tenants"),
  ...auditFields,
};
