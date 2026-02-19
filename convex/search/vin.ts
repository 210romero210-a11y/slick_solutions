import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireTenantAccess } from "../model/tenantGuards";
import { normalizeTopKResults, type RawSearchResult } from "./types";

export const retrieveVinSimilarity = query({
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
        kind: v.literal("vin"),
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

    const vehicleMatches = await ctx.vectorSearch("vehicles", "by_tenant_vin_embedding", {
      vector: args.embedding,
      limit: topK,
      filter: (q: any) => q.eq("tenantId", tenantId),
    });

    const rows: RawSearchResult[] = [];
    for (const match of vehicleMatches) {
      const vinProfile = await ctx.db
        .query("vinProfiles")
        .withIndex("by_tenant_vehicle", (q: any) => q.eq("tenantId", tenantId).eq("vehicleId", match._id))
        .first();

      rows.push({
        _id: `${match._id}`,
        _score: match._score,
        tenantId: `${match.tenantId}`,
        snippet: `${match.year} ${match.make} ${match.model} (${match.vin})`,
        metadata: {
          vin: match.vin,
          vehicleId: `${match._id}`,
          vinProfileId: vinProfile ? `${vinProfile._id}` : undefined,
        },
      });
    }

    return normalizeTopKResults(rows, tenantId, topK, {
      kind: "vin",
      sourceTable: "vehicles/vinProfiles",
      sourceIndex: "by_tenant_vin_embedding",
      tenantFilterApplied: true,
      matchField: "vinEmbedding",
    });
  },
});
