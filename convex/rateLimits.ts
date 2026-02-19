import { v } from "convex/values";

import { mutation } from "./_generated/server";

export const incrementActionRateLimit = mutation({
  args: {
    tenantKey: v.string(),
    operation: v.string(),
    windowMs: v.number(),
  },
  returns: v.object({
    count: v.number(),
    windowStart: v.number(),
  }),
  handler: async (ctx: any, args: any) => {
    const now = Date.now();
    const windowStart = now - (now % args.windowMs);

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
        updatedAt: now,
        expiresAt: windowStart + args.windowMs,
      });

      return {
        count: nextCount,
        windowStart,
      };
    }

    await ctx.db.insert("actionRateLimits", {
      tenantKey: args.tenantKey,
      operation: args.operation,
      windowStart,
      count: 1,
      expiresAt: windowStart + args.windowMs,
      createdAt: now,
      updatedAt: now,
    });

    return {
      count: 1,
      windowStart,
    };
  },
});
