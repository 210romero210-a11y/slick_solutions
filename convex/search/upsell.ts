import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireTenantAccess } from "../model/tenantGuards";
import { normalizeTopKResults, type RawSearchResult } from "./types";

export const retrieveUpsells = query({
  args: {
    tenantId: v.optional(v.string()),
    embedding: v.array(v.number()),
    topK: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      score: v.number(),
      recordId: v.string(),
      snippet: v.string(),
      explainability: v.object({
        kind: v.literal("upsell"),
        sourceTable: v.string(),
        sourceIndex: v.string(),
        tenantFilterApplied: v.boolean(),
        matchField: v.string(),
        metadata: v.optional(v.any()),
      }),
    }),
  ),
  handler: async (ctx: any, args: any) => {
    const tenantId = await requireTenantAccess(ctx, args.tenantId);
    const topK = Math.max(1, Math.min(25, args.topK ?? 5));

    const matches = await ctx.vectorSearch("upsellCatalog", "by_tenant_upsell_embedding", {
      vector: args.embedding,
      limit: topK,
      filter: (q: any) => q.eq("tenantId", tenantId),
    });

    const rows: RawSearchResult[] = matches.map((match: any) => ({
      _id: `${match._id}`,
      _score: match._score,
      tenantId: `${match.tenantId}`,
      snippet: `${match.name} (${match.category})`,
      metadata: {
        sku: match.sku,
        tags: match.tags,
        active: match.active,
      },
    }));

    return normalizeTopKResults(rows, tenantId, topK, {
      kind: "upsell",
      sourceTable: "upsellCatalog",
      sourceIndex: "by_tenant_upsell_embedding",
      tenantFilterApplied: true,
      matchField: "upsellEmbedding",
    });
  },
});
