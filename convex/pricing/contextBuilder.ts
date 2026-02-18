import { CompiledPricingContext, PricingRuleRecord, PricingServiceInput } from "./ruleEvaluator";

function normalizeVehicleClassFromVehicle(vehicle?: { model: string; trim?: string }): string {
  if (!vehicle) {
    return "unknown";
  }

  const haystack = `${vehicle.model} ${vehicle.trim ?? ""}`.toLowerCase();
  if (haystack.includes("truck")) return "truck";
  if (haystack.includes("van")) return "van";
  if (haystack.includes("suv")) return "suv";
  return "sedan";
}

export async function buildPricingContext(ctx: any, args: any): Promise<CompiledPricingContext> {
  const quote = args.quoteId ? await ctx.db.get(args.quoteId) : null;

  const resolvedInspectionId = args.inspectionId ?? quote?.inspectionId;
  const resolvedVehicleId = args.vehicleId ?? quote?.vehicleId;

  const inspection = resolvedInspectionId ? await ctx.db.get(resolvedInspectionId) : null;
  const vehicle = resolvedVehicleId ? await ctx.db.get(resolvedVehicleId) : null;

  const damageFindings = inspection
    ? await ctx.db
        .query("damageFindings")
        .withIndex("by_tenant_inspection", (q: any) => q.eq("tenantId", args.tenantId).eq("inspectionId", inspection._id))
        .collect()
    : [];

  const pricingRules = (await ctx.db
    .query("pricingRules")
    .withIndex("by_tenant_priority", (q: any) => q.eq("tenantId", args.tenantId))
    .collect()) as PricingRuleRecord[];

  const services: PricingServiceInput[] = args.services;

  return {
    tenantId: args.tenantId,
    ...(args.quoteId ? { quoteId: args.quoteId } : {}),
    ...(resolvedInspectionId ? { inspectionId: resolvedInspectionId } : {}),
    ...(resolvedVehicleId ? { vehicleId: resolvedVehicleId } : {}),
    ...(vehicle
      ? {
          vehicle: {
            vin: vehicle.vin,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            ...(vehicle.trim ? { trim: vehicle.trim } : {}),
          },
        }
      : {}),
    vehicleClass: normalizeVehicleClassFromVehicle(vehicle),
    services,
    inspectionSignals: {
      damageFindingsCount: damageFindings.length,
      severeDamageCount: damageFindings.filter((finding: any) => finding.severity === "high" || finding.severity === "critical").length,
    },
    requestSignals: {
      ...(args.difficultyScore != null ? { difficultyScore: args.difficultyScore } : {}),
      ...(args.demandMultiplier != null ? { demandMultiplier: args.demandMultiplier } : {}),
      ...(args.vehicleSizeMultiplier != null ? { vehicleSizeMultiplier: args.vehicleSizeMultiplier } : {}),
      ...(args.addOnsCents != null ? { addOnsCents: args.addOnsCents } : {}),
      ...(args.discountCents != null ? { discountCents: args.discountCents } : {}),
    },
    pricingRules,
  };
}
