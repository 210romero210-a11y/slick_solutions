import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAuthenticatedIdentity } from "./model/auth";

const runRecordValidator = v.object({
  runId: v.string(),
  inspectionId: v.string(),
  correlationId: v.optional(v.string()),
  tenantSlug: v.string(),
  vin: v.string(),
  model: v.string(),
  source: v.union(v.literal("ollama"), v.literal("heuristic_fallback")),
  severity: v.union(v.literal("minor"), v.literal("moderate"), v.literal("major"), v.literal("critical")),
  confidence: v.number(),
  summary: v.string(),
  recommendedServices: v.array(v.string()),
  rawResponse: v.optional(v.string()),
  preNormalizationPayload: v.optional(v.any()),
  postNormalizationPayload: v.optional(v.any()),
  validationAdjustments: v.optional(v.array(v.any())),
  validationReasons: v.optional(v.array(v.string())),
  needsManualReview: v.boolean(),
  reviewStatus: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
  reviewedBy: v.optional(v.string()),
  reviewedAt: v.optional(v.number()),
  reviewNotes: v.optional(v.string()),
  createdAt: v.number(),
});

export const createAssessmentRun = mutation({
  args: runRecordValidator.fields,
  handler: async (ctx: any, args: any) => {
    await requireAuthenticatedIdentity(ctx);

    const existing = await ctx.db
      .query("assessmentRuns")
      .withIndex("by_run_id", (q: any) => q.eq("runId", args.runId))
      .unique();

    const record = {
      ...args,
      reviewStatus: args.reviewStatus ?? "pending",
    };

    if (existing) {
      await ctx.db.patch(existing._id, record);
      return { ...existing, ...record };
    }

    const insertedId = await ctx.db.insert("assessmentRuns", record);
    return {
      _id: insertedId,
      _creationTime: Date.now(),
      ...record,
    };
  },
});

export const getAssessmentRun = query({
  args: { runId: v.string() },
  handler: async (ctx: any, args: any) => {
    await requireAuthenticatedIdentity(ctx);
    return await ctx.db
      .query("assessmentRuns")
      .withIndex("by_run_id", (q: any) => q.eq("runId", args.runId))
      .unique();
  },
});

export const reviewAssessmentRun = mutation({
  args: {
    runId: v.string(),
    reviewer: v.string(),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    notes: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireAuthenticatedIdentity(ctx);

    const run = await ctx.db
      .query("assessmentRuns")
      .withIndex("by_run_id", (q: any) => q.eq("runId", args.runId))
      .unique();

    if (!run) {
      return null;
    }

    const reviewedAt = args.reviewedAt ?? Date.now();
    const updatedFields = {
      reviewStatus: args.status,
      reviewedBy: args.reviewer,
      reviewedAt,
      ...(args.notes ? { reviewNotes: args.notes } : {}),
    };

    await ctx.db.patch(run._id, updatedFields);
    await ctx.db.insert("assessmentReviewDecisions", {
      runId: run.runId,
      tenantSlug: run.tenantSlug,
      reviewStatus: args.status,
      reviewer: args.reviewer,
      notes: args.notes,
      reviewedAt,
      createdAt: Date.now(),
    });

    return {
      ...run,
      ...updatedFields,
    };
  },
});
