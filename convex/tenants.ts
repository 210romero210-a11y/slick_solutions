import { v } from "convex/values";

import { query } from "./_generated/server";

export const getTenantBySlug = query({
  args: { slug: v.string() },
  returns: v.union(v.null(), v.object({ id: v.id("tenants") })),
  handler: async (ctx: any, args: any) => {
    const tenant = await ctx.db
      .query("tenants")
      .withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
      .unique();

    if (!tenant) {
      return null;
    }

    return { id: tenant._id };
  },
});
