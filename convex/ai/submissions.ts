import { v } from "convex/values";

import { action, mutation, query } from "../_generated/server";

const statusValidator = v.union(
  v.literal("PENDING"),
  v.literal("PROCESSING"),
  v.literal("COMPLETE"),
  v.literal("FAILED"),
);

const normalizeVin = (vin: string): string => vin.trim().toUpperCase();

const hashImageUrls = (imageUrls: string[]): string => {
  const seed = imageUrls
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
    .sort()
    .join("|");

  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33) ^ seed.charCodeAt(index);
  }

  return `img_${(hash >>> 0).toString(16)}`;
};

const normalizeSignals = (payload: {
  severity: "low" | "medium" | "high";
  confidence: number;
  primaryConcern: string;
  evidenceCount: number;
  recommendedServices: string[];
}) => ({
  severity: payload.severity,
  confidence: Number(payload.confidence.toFixed(3)),
  needsManualReview: payload.confidence < 0.55 || payload.severity === "high",
  primaryConcern: payload.primaryConcern,
  evidenceCount: payload.evidenceCount,
  recommendedServices: payload.recommendedServices,
});

export const submitInspection = mutation({
  args: {
    tenantId: v.id("tenants"),
    quoteId: v.string(),
    imageUrls: v.array(v.string()),
    vin: v.string(),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    submissionId: v.id("aiSubmissions"),
    idempotencyKey: v.string(),
    status: statusValidator,
    deduped: v.boolean(),
  }),
  handler: async (ctx: any, args: any) => {
    if (args.imageUrls.length === 0) {
      throw new Error("At least one image URL is required.");
    }

    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant) {
      throw new Error("Tenant not found.");
    }

    const vin = normalizeVin(args.vin);
    const idempotencyKey = `${args.quoteId}:${vin}:${hashImageUrls(args.imageUrls)}`;

    const existing = await ctx.db
      .query("aiSubmissions")
      .withIndex("by_tenant_idempotency_key", (q: any) => q.eq("tenantId", args.tenantId).eq("idempotencyKey", idempotencyKey))
      .first();

    if (existing) {
      return {
        submissionId: existing._id,
        idempotencyKey,
        status: existing.status,
        deduped: true,
      };
    }

    const now = Date.now();
    const submissionId = await ctx.db.insert("aiSubmissions", {
      tenantId: args.tenantId,
      quoteId: args.quoteId,
      imageUrls: args.imageUrls,
      vin,
      notes: args.notes,
      idempotencyKey,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });

    await ctx.scheduler.runAfter(0, "ai/submissions:processAIInspection", {
      submissionId,
      tenantId: args.tenantId,
    });

    return {
      submissionId,
      idempotencyKey,
      status: "PENDING",
      deduped: false,
    };
  },
});

export const processAIInspection = action({
  args: {
    submissionId: v.id("aiSubmissions"),
    tenantId: v.id("tenants"),
  },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    const startedAt = Date.now();
    const runId = await ctx.runMutation("ai/submissions:markSubmissionProcessing", {
      submissionId: args.submissionId,
      tenantId: args.tenantId,
      startedAt,
    });

    if (!runId) {
      return null;
    }

    try {
      const submission = await ctx.runQuery("ai/submissions:getSubmissionForProcessing", {
        submissionId: args.submissionId,
        tenantId: args.tenantId,
      });

      if (!submission) {
        throw new Error("Submission not found during processing.");
      }

      const evidenceCount = submission.imageUrls.length;
      const severity: "low" | "medium" | "high" =
        evidenceCount >= 8 ? "high" : evidenceCount >= 4 ? "medium" : "low";
      const confidence = Math.max(0.35, Math.min(0.96, 0.4 + evidenceCount * 0.07));
      const recommendedServices =
        severity === "high"
          ? ["panel restoration", "paint correction", "protective coating"]
          : severity === "medium"
            ? ["paint correction", "interior reconditioning"]
            : ["maintenance wash", "spot correction"];

      const rawAiPayload = {
        provider: "rule_based_gateway",
        model: "ai-submission-v1",
        runRef: runId,
        inspectedAt: new Date().toISOString(),
        result: {
          severity,
          confidence,
          primaryConcern: submission.notes ?? "general condition",
          evidenceCount,
          recommendedServices,
        },
      };

      await ctx.runMutation("ai/submissions:markSubmissionComplete", {
        submissionId: args.submissionId,
        tenantId: args.tenantId,
        completedAt: Date.now(),
        runId,
        rawAiPayload,
        normalizedSignals: normalizeSignals(rawAiPayload.result),
      });
    } catch (error) {
      await ctx.runMutation("ai/submissions:markSubmissionFailed", {
        submissionId: args.submissionId,
        tenantId: args.tenantId,
        failedAt: Date.now(),
        runId,
        errorCode: "AI_PROCESSING_FAILURE",
        errorMessage: error instanceof Error ? error.message : "Unknown processing error",
        errorMetadata: {
          submissionId: args.submissionId,
        },
      });
    }

    return null;
  },
});

export const getSubmissionForProcessing = query({
  args: {
    submissionId: v.id("aiSubmissions"),
    tenantId: v.id("tenants"),
  },
  returns: v.union(
    v.null(),
    v.object({
      imageUrls: v.array(v.string()),
      notes: v.optional(v.string()),
    }),
  ),
  handler: async (ctx: any, args: any) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission || submission.tenantId !== args.tenantId) {
      return null;
    }

    return {
      imageUrls: submission.imageUrls,
      notes: submission.notes,
    };
  },
});

export const markSubmissionProcessing = mutation({
  args: {
    submissionId: v.id("aiSubmissions"),
    tenantId: v.id("tenants"),
    startedAt: v.number(),
  },
  returns: v.union(v.null(), v.id("agentRuns")),
  handler: async (ctx: any, args: any) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission || submission.tenantId !== args.tenantId || submission.status !== "PENDING") {
      return null;
    }

    const runId = await ctx.db.insert("agentRuns", {
      tenantId: args.tenantId,
      agentName: "aiInspectionGateway",
      runType: "self_assessment",
      targetType: "aiSubmission",
      targetId: submission._id,
      status: "running",
      startedAt: args.startedAt,
      input: {
        imageCount: submission.imageUrls.length,
        idempotencyKey: submission.idempotencyKey,
      },
      createdAt: args.startedAt,
      updatedAt: args.startedAt,
      isDeleted: false,
    });

    await ctx.db.patch(submission._id, {
      status: "PROCESSING",
      aiRunId: runId,
      providerRunId: `${runId}`,
      processingStartedAt: args.startedAt,
      updatedAt: args.startedAt,
    });

    return runId;
  },
});

export const markSubmissionComplete = mutation({
  args: {
    submissionId: v.id("aiSubmissions"),
    tenantId: v.id("tenants"),
    completedAt: v.number(),
    runId: v.id("agentRuns"),
    rawAiPayload: v.any(),
    normalizedSignals: v.any(),
  },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission || submission.tenantId !== args.tenantId) {
      return null;
    }

    await ctx.db.patch(submission._id, {
      status: "COMPLETE",
      completedAt: args.completedAt,
      aiRunId: args.runId,
      rawAiPayload: args.rawAiPayload,
      normalizedSignals: args.normalizedSignals,
      errorCode: undefined,
      errorMessage: undefined,
      errorMetadata: undefined,
      updatedAt: args.completedAt,
    });

    await ctx.db.patch(args.runId, {
      status: "succeeded",
      finishedAt: args.completedAt,
      output: {
        submissionId: submission._id,
        normalizedSignals: args.normalizedSignals,
      },
      updatedAt: args.completedAt,
    });

    return null;
  },
});

export const markSubmissionFailed = mutation({
  args: {
    submissionId: v.id("aiSubmissions"),
    tenantId: v.id("tenants"),
    failedAt: v.number(),
    runId: v.id("agentRuns"),
    errorCode: v.string(),
    errorMessage: v.string(),
    errorMetadata: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission || submission.tenantId !== args.tenantId) {
      return null;
    }

    await ctx.db.patch(submission._id, {
      status: "FAILED",
      failedAt: args.failedAt,
      aiRunId: args.runId,
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      errorMetadata: args.errorMetadata,
      updatedAt: args.failedAt,
    });

    await ctx.db.patch(args.runId, {
      status: "failed",
      finishedAt: args.failedAt,
      error: {
        code: args.errorCode,
        message: args.errorMessage,
        metadata: args.errorMetadata,
      },
      updatedAt: args.failedAt,
    });

    return null;
  },
});
