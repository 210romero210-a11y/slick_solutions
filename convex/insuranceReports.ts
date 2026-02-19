import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

export const createReportArtifact = mutation({
  args: {
    inspectionId: v.string(),
    artifactKey: v.string(),
    fileName: v.string(),
    mimeType: v.literal("application/pdf"),
    byteLength: v.number(),
    sections: v.array(v.string()),
    generatedAt: v.string(),
    generatedAtEpochMs: v.number(),
    hash: v.string(),
    templateVersion: v.string(),
    sourceModels: v.array(v.string()),
    reportVersion: v.number(),
    artifactBase64: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    return await ctx.db.insert("insuranceReports", {
      inspectionId: args.inspectionId,
      artifactKey: args.artifactKey,
      fileName: args.fileName,
      mimeType: args.mimeType,
      byteLength: args.byteLength,
      sections: args.sections,
      generatedAt: args.generatedAt,
      generatedAtEpochMs: args.generatedAtEpochMs,
      hash: args.hash,
      templateVersion: args.templateVersion,
      sourceModels: args.sourceModels,
      reportVersion: args.reportVersion,
      artifactBase64: args.artifactBase64,
    });
  },
});

export const getReportArtifact = query({
  args: {
    inspectionId: v.string(),
    artifactKey: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    if (args.artifactKey) {
      const report = await ctx.db
        .query("insuranceReports")
        .withIndex("by_inspection_artifact", (q: any) => q.eq("inspectionId", args.inspectionId).eq("artifactKey", args.artifactKey))
        .first();

      return report ?? null;
    }

    const latest = await ctx.db
      .query("insuranceReports")
      .withIndex("by_inspection_generated", (q: any) => q.eq("inspectionId", args.inspectionId))
      .order("desc")
      .first();

    return latest ?? null;
  },
});
