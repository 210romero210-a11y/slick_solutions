import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { QUOTE_STATUS } from "./model/constants";
import { requireAuthenticatedIdentity } from "./model/auth";
import { requireTenantAccess } from "./model/tenantGuards";

const quoteStatusValidator = v.union(...QUOTE_STATUS.map((status) => v.literal(status)));
async function appendQuoteSnapshot(ctx: any, args: {
  tenantId: any;
  quoteId: any;
  snapshotEvent: "quote_created" | "quote_revised" | "quote_finalized";
  pricingInputPayload: unknown;
  normalizedContext: unknown;
  ruleMetadata: unknown;
  computedLineItems: unknown[];
  computedTotals: unknown;
  actorId?: any;
  actorSource: string;
  snapshotAt: number;
}) {
  await ctx.db.insert("quoteSnapshots", {
    tenantId: args.tenantId,
    quoteId: args.quoteId,
    snapshotEvent: args.snapshotEvent,
    pricingInputPayload: args.pricingInputPayload,
    normalizedContext: args.normalizedContext,
    ruleMetadata: args.ruleMetadata,
    computedLineItems: args.computedLineItems,
    computedTotals: args.computedTotals,
    snapshotAt: args.snapshotAt,
    actorId: args.actorId,
    actorSource: args.actorSource,
  });
}

export const createQuote = mutation({
  args: {
    tenantId: v.id("tenants"),
    customerProfileId: v.id("customerProfiles"),
    vehicleId: v.id("vehicles"),
    inspectionId: v.optional(v.id("inspections")),
    quoteNumber: v.string(),
    currency: v.string(),
    status: quoteStatusValidator,
    lineItems: v.array(v.any()),
    subtotalCents: v.number(),
    taxCents: v.number(),
    totalCents: v.number(),
    validUntil: v.optional(v.number()),
    pricingInputPayload: v.any(),
    normalizedContext: v.any(),
    ruleMetadata: v.any(),
    actorId: v.optional(v.id("users")),
    actorSource: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    await requireAuthenticatedIdentity(ctx);

    const now = Date.now();

    const quoteId = await ctx.db.insert("quotes", {
      tenantId: args.tenantId,
      customerProfileId: args.customerProfileId,
      vehicleId: args.vehicleId,
      inspectionId: args.inspectionId,
      quoteNumber: args.quoteNumber,
      status: args.status,
      subtotalCents: args.subtotalCents,
      taxCents: args.taxCents,
      totalCents: args.totalCents,
      currency: args.currency,
      lineItems: args.lineItems,
      validUntil: args.validUntil,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });

    await appendQuoteSnapshot(ctx, {
      tenantId: args.tenantId,
      quoteId,
      snapshotEvent: "quote_created",
      pricingInputPayload: args.pricingInputPayload,
      normalizedContext: args.normalizedContext,
      ruleMetadata: args.ruleMetadata,
      computedLineItems: args.lineItems,
      computedTotals: {
        subtotalCents: args.subtotalCents,
        taxCents: args.taxCents,
        totalCents: args.totalCents,
        currency: args.currency,
      },
      actorId: args.actorId,
      actorSource: args.actorSource,
      snapshotAt: now,
    });

    return quoteId;
  },
});

export const reviseQuote = mutation({
  args: {
    tenantId: v.id("tenants"),
    quoteId: v.id("quotes"),
    lineItems: v.array(v.any()),
    subtotalCents: v.number(),
    taxCents: v.number(),
    totalCents: v.number(),
    currency: v.string(),
    pricingInputPayload: v.any(),
    normalizedContext: v.any(),
    ruleMetadata: v.any(),
    actorId: v.optional(v.id("users")),
    actorSource: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    await requireAuthenticatedIdentity(ctx);

    const quote = await ctx.db.get(args.quoteId);
    if (!quote || quote.tenantId !== args.tenantId) {
      throw new Error("Quote not found for tenant");
    }

    const now = Date.now();

    await ctx.db.patch(args.quoteId, {
      lineItems: args.lineItems,
      subtotalCents: args.subtotalCents,
      taxCents: args.taxCents,
      totalCents: args.totalCents,
      currency: args.currency,
      updatedAt: now,
    });

    await appendQuoteSnapshot(ctx, {
      tenantId: args.tenantId,
      quoteId: args.quoteId,
      snapshotEvent: "quote_revised",
      pricingInputPayload: args.pricingInputPayload,
      normalizedContext: args.normalizedContext,
      ruleMetadata: args.ruleMetadata,
      computedLineItems: args.lineItems,
      computedTotals: {
        subtotalCents: args.subtotalCents,
        taxCents: args.taxCents,
        totalCents: args.totalCents,
        currency: args.currency,
      },
      actorId: args.actorId,
      actorSource: args.actorSource,
      snapshotAt: now,
    });

    return args.quoteId;
  },
});

export const finalizeQuote = mutation({
  args: {
    tenantId: v.id("tenants"),
    quoteId: v.id("quotes"),
    status: quoteStatusValidator,
    reason: v.optional(v.string()),
    pricingInputPayload: v.any(),
    normalizedContext: v.any(),
    ruleMetadata: v.any(),
    actorId: v.optional(v.id("users")),
    actorSource: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    await requireAuthenticatedIdentity(ctx);

    const quote = await ctx.db.get(args.quoteId);
    if (!quote || quote.tenantId !== args.tenantId) {
      throw new Error("Quote not found for tenant");
    }

    const now = Date.now();

    const finalizedPatch: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    if (args.status === "approved") {
      finalizedPatch.approvedAt = now;
    }

    if (args.status === "declined") {
      finalizedPatch.declinedAt = now;
    }

    await ctx.db.patch(args.quoteId, finalizedPatch);

    await ctx.db.insert("quoteTransitionEvents", {
      tenantId: args.tenantId,
      quoteId: args.quoteId,
      fromStatus: quote.status,
      toStatus: args.status,
      reason: args.reason,
      eventAt: now,
      actorId: args.actorId,
      metadata: {
        actorSource: args.actorSource,
      },
    });

    await appendQuoteSnapshot(ctx, {
      tenantId: args.tenantId,
      quoteId: args.quoteId,
      snapshotEvent: "quote_finalized",
      pricingInputPayload: args.pricingInputPayload,
      normalizedContext: args.normalizedContext,
      ruleMetadata: args.ruleMetadata,
      computedLineItems: quote.lineItems,
      computedTotals: {
        subtotalCents: quote.subtotalCents,
        taxCents: quote.taxCents,
        totalCents: quote.totalCents,
        currency: quote.currency,
        status: args.status,
      },
      actorId: args.actorId,
      actorSource: args.actorSource,
      snapshotAt: now,
    });

    return args.quoteId;
  },
});

export const replayQuote = query({
  args: {
    tenantId: v.id("tenants"),
    quoteId: v.id("quotes"),
  },
  handler: async (ctx: any, args: any) => {
    await requireAuthenticatedIdentity(ctx);

    const quote = await ctx.db.get(args.quoteId);
    if (!quote || quote.tenantId !== args.tenantId) {
      throw new Error("Quote not found for tenant");
    }

    const snapshots = await ctx.db
      .query("quoteSnapshots")
      .withIndex("by_tenant_quote_snapshot_at", (q: any) => q.eq("tenantId", args.tenantId).eq("quoteId", args.quoteId))
      .collect();

    return {
      quote,
      snapshots,
      replaySteps: snapshots.map((snapshot: any) => ({
        snapshotId: snapshot._id,
        snapshotEvent: snapshot.snapshotEvent,
        snapshotAt: snapshot.snapshotAt,
        computedLineItems: snapshot.computedLineItems,
        computedTotals: snapshot.computedTotals,
      })),
    };
  },
});

export const explainQuotePrice = query({
  args: {
    tenantId: v.id("tenants"),
    quoteId: v.id("quotes"),
  },
  handler: async (ctx: any, args: any) => {
    const tenantId = await requireTenantAccess(ctx, args.tenantId);

    const quote = await ctx.db.get(args.quoteId);
    if (!quote || quote.tenantId !== tenantId) {
      throw new Error("Quote not found for tenant");
    }

    const snapshots = await ctx.db
      .query("quoteSnapshots")
      .withIndex("by_tenant_quote_snapshot_at", (q: any) => q.eq("tenantId", tenantId).eq("quoteId", args.quoteId))
      .collect();

    const latestSnapshot = snapshots.at(-1);
    if (!latestSnapshot) {
      return {
        quoteId: args.quoteId,
        message: "No quote snapshot artifacts available for this quote.",
      };
    }

    const coefficientBreakdown = Object.entries((latestSnapshot.coefficientSnapshot ?? {}) as Record<string, unknown>).map(
      ([coefficientKey, coefficientValue]) => ({
        coefficientKey,
        coefficientValue,
      }),
    );

    const explanationTrace = [
      `Quote ${quote.quoteNumber} is currently ${quote.totalCents} ${quote.currency.toUpperCase()} cents inclusive of tax.`,
      `Snapshot event: ${latestSnapshot.snapshotEvent} at ${new Date(latestSnapshot.snapshotAt).toISOString()}.`,
      ...(Array.isArray(latestSnapshot.calculationTrace)
        ? latestSnapshot.calculationTrace.map((step: unknown, index: number) => `Step ${index + 1}: ${JSON.stringify(step)}`)
        : ["No structured calculation trace was captured in this snapshot."]),
    ];

    return {
      quoteId: args.quoteId,
      currentQuoteTotal: {
        subtotalCents: quote.subtotalCents,
        taxCents: quote.taxCents,
        totalCents: quote.totalCents,
        currency: quote.currency,
      },
      coefficientBreakdown,
      explanationTrace,
      latestSnapshot: {
        snapshotEvent: latestSnapshot.snapshotEvent,
        snapshotAt: latestSnapshot.snapshotAt,
        actorSource: latestSnapshot.actorSource,
      },
    };
  },
});
