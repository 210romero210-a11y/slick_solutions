import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireTenantAccess } from "../model/tenantGuards";
import { normalizeTopKResults, type RawSearchResult } from "./types";

export const retrieveInspectionAndDamageSimilarity = query({
  args: {
    tenantId: v.optional(v.string()),
    inspectionEmbedding: v.array(v.number()),
    damageEmbedding: v.array(v.number()),
    topK: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      score: v.number(),
      recordId: v.string(),
      snippet: v.string(),
      explainability: v.object({
        kind: v.literal("inspectionDamage"),
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

    const inspectionMatches = await ctx.vectorSearch("inspections", "by_tenant_inspection_embedding", {
      vector: args.inspectionEmbedding,
      limit: topK,
      filter: (q: any) => q.eq("tenantId", tenantId),
    });

    const damageMatches = await ctx.vectorSearch("damageFindings", "by_tenant_damage_embedding", {
      vector: args.damageEmbedding,
      limit: topK,
      filter: (q: any) => q.eq("tenantId", tenantId),
    });

    const rows: RawSearchResult[] = [
      ...inspectionMatches.map((match: any) => ({
        _id: `${match._id}`,
        _score: match._score,
        tenantId: `${match.tenantId}`,
        snippet: `Inspection ${match.status}${match.summary ? `: ${match.summary}` : ""}`,
        metadata: {
          source: "inspections",
          vehicleId: `${match.vehicleId}`,
        },
      })),
      ...damageMatches.map((match: any) => ({
        _id: `${match._id}`,
        _score: match._score,
        tenantId: `${match.tenantId}`,
        snippet: `${match.category} damage (${match.severity})`,
        metadata: {
          source: "damageFindings",
          inspectionId: `${match.inspectionId}`,
          vehicleId: `${match.vehicleId}`,
        },
      })),
    ];

    return normalizeTopKResults(rows, tenantId, topK, {
      kind: "inspectionDamage",
      sourceTable: "inspections/damageFindings",
      sourceIndex: "by_tenant_inspection_embedding|by_tenant_damage_embedding",
      tenantFilterApplied: true,
      matchField: "inspectionEmbedding|damageEmbedding",
    });
  },
});
