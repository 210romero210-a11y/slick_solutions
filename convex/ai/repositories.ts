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

export const insertAiUsageLedgerEntry = mutation({
  args: {
    tenantId: v.string(),
    actorId: v.optional(v.string()),
    model: v.string(),
    operation: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
    estimatedCostUsd: v.number(),
    cacheHit: v.boolean(),
    metadata: v.optional(v.any()),
    now: v.number(),
  },
  returns: v.id("aiUsageLedger"),
  handler: async (ctx: any, args: any) => {
    return ctx.db.insert("aiUsageLedger", {
      tenantId: args.tenantId,
      provider: "internal",
      model: args.model,
      feature: args.operation,
      promptTokens: args.inputTokens,
      completionTokens: args.outputTokens,
      totalTokens: args.totalTokens,
      costMicrosUsd: Math.round(args.estimatedCostUsd * 1_000_000),
      requestId: typeof args.metadata?.requestId === "string" ? args.metadata.requestId : undefined,
      metadata: {
        ...(args.metadata ?? {}),
        cacheHit: args.cacheHit,
        ...(args.actorId ? { actorId: args.actorId } : {}),
      },
      createdAt: args.now,
      updatedAt: args.now,
      isDeleted: false,
    });
  },
});

export const incrementActionRateLimit = mutation({
  args: {
    tenantKey: v.string(),
    operation: v.string(),
    windowMs: v.number(),
    now: v.number(),
  },
  returns: v.object({
    count: v.number(),
    windowStart: v.number(),
  }),
  handler: async (ctx: any, args: any) => {
    const windowStart = args.now - (args.now % args.windowMs);

    const staleRows = await ctx.db
      .query("actionRateLimits")
      .withIndex("by_expires_at", (q: any) => q.lt("expiresAt", args.now))
      .take(50);

    await Promise.all(staleRows.map((row: any) => ctx.db.delete(row._id)));

    const existing = await ctx.db
      .query("actionRateLimits")
      .withIndex("by_tenant_operation_window", (q: any) =>
        q.eq("tenantKey", args.tenantKey).eq("operation", args.operation).eq("windowStart", windowStart),
      )
      .first();

    if (existing) {
      const nextCount = existing.count + 1;
      await ctx.db.patch(existing._id, {
        count: nextCount,
        updatedAt: args.now,
        expiresAt: windowStart + args.windowMs,
      });

      return { count: nextCount, windowStart };
    }

    await ctx.db.insert("actionRateLimits", {
      tenantKey: args.tenantKey,
      operation: args.operation,
      windowStart,
      count: 1,
      expiresAt: windowStart + args.windowMs,
      createdAt: args.now,
      updatedAt: args.now,
    });

    return { count: 1, windowStart };
  },
});

export const getActionCacheEntry = mutation({
  args: {
    tenantKey: v.string(),
    cacheKey: v.string(),
    now: v.number(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx: any, args: any) => {
    const row = await ctx.db
      .query("actionCache")
      .withIndex("by_tenant_cache_key", (q: any) => q.eq("tenantKey", args.tenantKey).eq("cacheKey", args.cacheKey))
      .first();

    if (!row) {
      return null;
    }

    if (row.expiresAt <= args.now) {
      await ctx.db.delete(row._id);
      return null;
    }

    return row.value;
  },
});

export const setActionCacheEntry = mutation({
  args: {
    tenantKey: v.string(),
    cacheKey: v.string(),
    value: v.any(),
    ttlMs: v.number(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    const expiresAt = args.now + args.ttlMs;
    const staleRows = await ctx.db
      .query("actionCache")
      .withIndex("by_expires_at", (q: any) => q.lt("expiresAt", args.now))
      .take(50);
    await Promise.all(staleRows.map((row: any) => ctx.db.delete(row._id)));

    const existing = await ctx.db
      .query("actionCache")
      .withIndex("by_tenant_cache_key", (q: any) => q.eq("tenantKey", args.tenantKey).eq("cacheKey", args.cacheKey))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        expiresAt,
        updatedAt: args.now,
      });
      return null;
    }

    await ctx.db.insert("actionCache", {
      tenantKey: args.tenantKey,
      cacheKey: args.cacheKey,
      value: args.value,
      expiresAt,
      createdAt: args.now,
      updatedAt: args.now,
    });
    return null;
  },
});

const DAY_MS = 86_400_000;

export const getTenantAiCostRollupDaily = query({
  args: {
    tenantId: v.string(),
    fromInclusive: v.number(),
    toExclusive: v.number(),
  },
  returns: v.array(
    v.object({
      bucketStart: v.number(),
      totalCostMicrosUsd: v.number(),
      totalTokens: v.number(),
      entries: v.number(),
    }),
  ),
  handler: async (ctx: any, args: any) => {
    const rows = await ctx.db
      .query("aiUsageLedger")
      .withIndex("by_tenant_created_at", (q: any) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("isDeleted", false)
          .gte("createdAt", args.fromInclusive)
          .lt("createdAt", args.toExclusive),
      )
      .collect();

    const buckets = new Map<number, { totalCostMicrosUsd: number; totalTokens: number; entries: number }>();
    for (const row of rows) {
      const bucketStart = row.createdAt - (row.createdAt % DAY_MS);
      const bucket = buckets.get(bucketStart) ?? { totalCostMicrosUsd: 0, totalTokens: 0, entries: 0 };
      bucket.totalCostMicrosUsd += row.costMicrosUsd;
      bucket.totalTokens += row.totalTokens;
      bucket.entries += 1;
      buckets.set(bucketStart, bucket);
    }

    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([bucketStart, bucket]) => ({ bucketStart, ...bucket }));
  },
});

export const getTenantAiCostRollupMonthly = query({
  args: {
    tenantId: v.string(),
    fromInclusive: v.number(),
    toExclusive: v.number(),
  },
  returns: v.array(
    v.object({
      bucketStart: v.number(),
      totalCostMicrosUsd: v.number(),
      totalTokens: v.number(),
      entries: v.number(),
    }),
  ),
  handler: async (ctx: any, args: any) => {
    const rows = await ctx.db
      .query("aiUsageLedger")
      .withIndex("by_tenant_created_at", (q: any) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("isDeleted", false)
          .gte("createdAt", args.fromInclusive)
          .lt("createdAt", args.toExclusive),
      )
      .collect();

    const buckets = new Map<number, { totalCostMicrosUsd: number; totalTokens: number; entries: number }>();
    for (const row of rows) {
      const date = new Date(row.createdAt);
      const bucketStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
      const bucket = buckets.get(bucketStart) ?? { totalCostMicrosUsd: 0, totalTokens: 0, entries: 0 };
      bucket.totalCostMicrosUsd += row.costMicrosUsd;
      bucket.totalTokens += row.totalTokens;
      bucket.entries += 1;
      buckets.set(bucketStart, bucket);
    }

    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([bucketStart, bucket]) => ({ bucketStart, ...bucket }));
  },
});
