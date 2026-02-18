import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireAuthenticatedIdentity } from "../model/auth";

export const persistPricingLineage = mutation({
  args: {
    tenantId: v.id("tenants"),
    quoteId: v.id("quotes"),
    quoteVersion: v.number(),
    inspectionId: v.optional(v.id("inspections")),
    assessmentRunId: v.optional(v.string()),
    correlationId: v.string(),
    artifact: v.any(),
  },
  handler: async (ctx: any, args: any) => {
    await requireAuthenticatedIdentity(ctx);

    const now = Date.now();

    const existing = await ctx.db
      .query("pricingLineage")
      .withIndex("by_tenant_quote_version", (q: any) =>
        q.eq("tenantId", args.tenantId).eq("quoteId", args.quoteId).eq("quoteVersion", args.quoteVersion),
      )
      .unique();

    const payload = {
      tenantId: args.tenantId,
      quoteId: args.quoteId,
      quoteVersion: args.quoteVersion,
      ...(args.inspectionId ? { inspectionId: args.inspectionId } : {}),
      ...(args.assessmentRunId ? { assessmentRunId: args.assessmentRunId } : {}),
      correlationId: args.correlationId,
      artifact: args.artifact,
      createdAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { ...existing, ...payload };
    }

    const insertedId = await ctx.db.insert("pricingLineage", payload);
    return { _id: insertedId, _creationTime: now, ...payload };
  },
});

export const getPriceLineage = query({
  args: {
    quoteId: v.id("quotes"),
    quoteVersion: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireAuthenticatedIdentity(ctx);

    const quote = await ctx.db.get(args.quoteId);
    if (!quote) {
      return null;
    }

    const requestedVersion = args.quoteVersion ?? quote.quoteVersion;

    const lineage = await ctx.db
      .query("pricingLineage")
      .withIndex("by_quote_version", (q: any) => q.eq("quoteId", args.quoteId).eq("quoteVersion", requestedVersion))
      .unique();

    const signalRows = await ctx.db
      .query("aiSignals")
      .withIndex("by_tenant_quote", (q: any) => q.eq("tenantId", quote.tenantId).eq("quoteId", args.quoteId))
      .collect();

    const runRows = quote.inspectionId
      ? await ctx.db
          .query("assessmentRuns")
          .filter((q: any) => q.eq(q.field("inspectionId"), String(quote.inspectionId)))
          .collect()
      : [];

    const correlationId = lineage?.correlationId ?? quote.correlationId ?? signalRows.at(0)?.correlationId;

    return {
      quote: {
        quoteId: quote._id,
        quoteNumber: quote.quoteNumber,
        quoteVersion: quote.quoteVersion,
        status: quote.status,
        totals: {
          subtotalCents: quote.subtotalCents,
          taxCents: quote.taxCents,
          totalCents: quote.totalCents,
          currency: quote.currency,
        },
      },
      requestedVersion,
      correlationId,
      ruleLineage: lineage?.artifact ?? null,
      aiSignals: signalRows.map((row: any) => ({
        id: row._id,
        signalType: row.signalType,
        status: row.validationStatus,
        validationNotes: row.validationNotes,
        normalizedPayload: row.normalizedPayload,
      })),
      assessmentRuns: runRows.map((row: any) => ({
        runId: row.runId,
        source: row.source,
        severity: row.severity,
        confidence: row.confidence,
        reviewStatus: row.reviewStatus,
        summary: row.summary,
        correlationId: row.correlationId,
      })),
      explanation: lineage
        ? "Reconstructed price lineage from stored pricing artifacts, AI signals, and assessment runs."
        : "Quote exists but no persisted pricing lineage artifact found for requested version.",
    };
  },
});
