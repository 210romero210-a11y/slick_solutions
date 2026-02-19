import { v } from "convex/values";

import { action, mutation } from "../_generated/server";
import { AgentRunner } from "./agentRunner";
import { deliveryAgent, inspectionAgent, pricingAgent, upsellAgent } from "./agents";
import { ConvexAgentPersistenceAdapter } from "./persistenceAdapters";
import { createDefaultToolRegistry } from "./tools";

export const runInspectionLifecycle = action({
  args: {
    tenantId: v.id("tenants"),
    inspectionId: v.id("inspections"),
    vehicleId: v.id("vehicles"),
    vin: v.string(),
    customerName: v.string(),
    notes: v.optional(v.string()),
    laborCents: v.number(),
    materialsCents: v.number(),
    taxRate: v.number(),
  },
  returns: v.object({
    inspectionRunId: v.string(),
    pricingRunId: v.string(),
    upsellRunId: v.string(),
    deliveryRunId: v.string(),
  }),
  handler: async (ctx: any, args: any) => {
    const persistence = new ConvexAgentPersistenceAdapter(ctx);
    const runner = new AgentRunner(persistence, createDefaultToolRegistry());

    const inspectionRun = await runner.run(
      `${args.tenantId}`,
      inspectionAgent,
      { vin: args.vin, notes: args.notes },
      { runType: "inspection_lifecycle", targetType: "inspection", targetId: `${args.inspectionId}` },
    );

    await runner.remember(`${args.tenantId}`, inspectionAgent.namespace, `${args.inspectionId}:summary`, inspectionRun.output.summary, {
      inspectionId: `${args.inspectionId}`,
    });

    const pricingRun = await runner.run(
      `${args.tenantId}`,
      pricingAgent,
      {
        laborCents: args.laborCents,
        materialsCents: args.materialsCents,
        taxRate: args.taxRate,
      },
      { runType: "inspection_lifecycle", targetType: "inspection", targetId: `${args.inspectionId}` },
    );

    const upsellRun = await runner.run(
      `${args.tenantId}`,
      upsellAgent,
      {
        summary: inspectionRun.output.summary,
        estimatedTotalCents: pricingRun.output.total,
      },
      { runType: "inspection_lifecycle", targetType: "inspection", targetId: `${args.inspectionId}` },
    );

    const deliveryRun = await runner.run(
      `${args.tenantId}`,
      deliveryAgent,
      {
        customerName: args.customerName,
        priceTotalCents: pricingRun.output.total,
      },
      { runType: "inspection_lifecycle", targetType: "inspection", targetId: `${args.inspectionId}` },
    );

    await ctx.runMutation("ai/orchestrator:persistInspectionLifecycleStage", {
      tenantId: args.tenantId,
      inspectionId: args.inspectionId,
      vehicleId: args.vehicleId,
      inspectionOutput: inspectionRun.output,
      pricingOutput: pricingRun.output,
      upsellOutput: upsellRun.output,
      deliveryOutput: deliveryRun.output,
      createdAt: Date.now(),
    });

    return {
      inspectionRunId: inspectionRun.runId,
      pricingRunId: pricingRun.runId,
      upsellRunId: upsellRun.runId,
      deliveryRunId: deliveryRun.runId,
    };
  },
});

export const persistInspectionLifecycleStage = mutation({
  args: {
    tenantId: v.id("tenants"),
    inspectionId: v.id("inspections"),
    vehicleId: v.id("vehicles"),
    inspectionOutput: v.any(),
    pricingOutput: v.any(),
    upsellOutput: v.any(),
    deliveryOutput: v.any(),
    createdAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    await ctx.db.patch(args.inspectionId, {
      summary: args.inspectionOutput.summary,
      rawPayload: {
        inspectionOutput: args.inspectionOutput,
        upsellOutput: args.upsellOutput,
        deliveryOutput: args.deliveryOutput,
      },
      updatedAt: args.createdAt,
    });

    await ctx.db.insert("pricingCalculations", {
      tenantId: args.tenantId,
      inspectionId: args.inspectionId,
      vehicleId: args.vehicleId,
      input: {
        source: "agent_orchestrator",
      },
      output: args.pricingOutput,
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
      isDeleted: false,
    });

    await ctx.db.insert("aiSignals", {
      tenantId: args.tenantId,
      inspectionId: args.inspectionId,
      correlationId: `inspection:${args.inspectionId}`,
      signalType: "inspection_lifecycle",
      normalizedPayload: {
        upsell: args.upsellOutput,
        delivery: args.deliveryOutput,
      },
      validationStatus: "validated",
      validatedAt: args.createdAt,
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
      isDeleted: false,
    });

    return null;
  },
});
