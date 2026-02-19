import { v } from "convex/values";

import { mutation, query } from "../_generated/server";

export const createAgentRun = mutation({
  args: {
    tenantId: v.id("tenants"),
    agentName: v.string(),
    runType: v.string(),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    input: v.any(),
    startedAt: v.number(),
  },
  returns: v.id("agentRuns"),
  handler: async (ctx: any, args: any) =>
    ctx.db.insert("agentRuns", {
      tenantId: args.tenantId,
      agentName: args.agentName,
      runType: args.runType,
      targetType: args.targetType,
      targetId: args.targetId,
      status: "running",
      startedAt: args.startedAt,
      input: args.input,
      createdAt: args.startedAt,
      updatedAt: args.startedAt,
      isDeleted: false,
    }),
});

export const completeAgentRun = mutation({
  args: {
    runId: v.id("agentRuns"),
    output: v.any(),
    finishedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    await ctx.db.patch(args.runId, {
      status: "succeeded",
      output: args.output,
      finishedAt: args.finishedAt,
      updatedAt: args.finishedAt,
    });
    return null;
  },
});

export const failAgentRun = mutation({
  args: {
    runId: v.id("agentRuns"),
    error: v.any(),
    finishedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    await ctx.db.patch(args.runId, {
      status: "failed",
      error: args.error,
      finishedAt: args.finishedAt,
      updatedAt: args.finishedAt,
    });
    return null;
  },
});

export const listAgentMemory = query({
  args: {
    tenantId: v.id("tenants"),
    namespace: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      id: v.string(),
      tenantId: v.string(),
      namespace: v.string(),
      key: v.string(),
      content: v.any(),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx: any, args: any) => {
    const limit = Math.max(1, Math.min(50, args.limit ?? 10));
    const rows = await ctx.db
      .query("agentMemory")
      .withIndex("by_tenant_namespace_key", (q: any) => q.eq("tenantId", args.tenantId).eq("namespace", args.namespace))
      .order("desc")
      .take(limit);

    return rows.map((row: any) => ({
      id: `${row._id}`,
      tenantId: `${row.tenantId}`,
      namespace: row.namespace,
      key: row.key,
      content: row.value,
      metadata: row.metadata,
      createdAt: row.createdAt,
    }));
  },
});

export const putAgentMemory = mutation({
  args: {
    tenantId: v.id("tenants"),
    namespace: v.string(),
    key: v.string(),
    value: v.any(),
    metadata: v.optional(v.any()),
    expiresAt: v.optional(v.number()),
    now: v.number(),
  },
  returns: v.id("agentMemory"),
  handler: async (ctx: any, args: any) => {
    const existing = await ctx.db
      .query("agentMemory")
      .withIndex("by_tenant_namespace_key", (q: any) =>
        q.eq("tenantId", args.tenantId).eq("namespace", args.namespace).eq("key", args.key),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        metadata: args.metadata,
        expiresAt: args.expiresAt,
        updatedAt: args.now,
      });
      return existing._id;
    }

    return ctx.db.insert("agentMemory", {
      tenantId: args.tenantId,
      namespace: args.namespace,
      key: args.key,
      value: args.value,
      metadata: args.metadata,
      expiresAt: args.expiresAt,
      createdAt: args.now,
      updatedAt: args.now,
      isDeleted: false,
    });
  },
});
