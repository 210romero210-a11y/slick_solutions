import {
  AiPricingInference,
  DamageFinding,
  Estimate,
  EstimateLineItem,
  PricingContext,
  PricingEngineInput,
} from "./types";
import { generateUpsellRecommendations } from "../upsell/upsellService";

const DAMAGE_SEVERITY_MULTIPLIER: Record<DamageFinding["severity"], number> = {
  minor: 1,
  moderate: 1.6,
  severe: 2.4,
};

function buildRuleBasedLineItems(context: PricingContext): EstimateLineItem[] {
  return context.damageFindings.map((finding, index) => {
    const base = 90;
    const multiplier = DAMAGE_SEVERITY_MULTIPLIER[finding.severity];
    const historicalInfluence =
      context.historicalMatches.length > 0
        ? context.historicalMatches.reduce((acc, match) => acc + match.totalPrice, 0) /
          context.historicalMatches.length /
          1000
        : 1;

    const unitPrice = Number((base * multiplier * Math.max(historicalInfluence, 0.75)).toFixed(2));

    return {
      code: `DMG-${index + 1}`,
      description: `${finding.panel} ${finding.type} (${finding.severity})`,
      quantity: 1,
      unitPrice,
      total: unitPrice,
      confidence: Number(Math.min(Math.max(finding.confidence, 0.2), 0.95).toFixed(2)),
      source: "rule",
    };
  });
}

function applyTenantRules(
  subtotal: number,
  laborHours: number,
  context: PricingContext,
): { subtotal: number; laborHours: number } {
  return context.tenantRules
    .filter((rule) => rule.enabled && rule.appliesTo(context))
    .reduce(
      (acc, rule) => {
        const nextSubtotal = rule.adjustPrice ? rule.adjustPrice(acc.subtotal, context) : acc.subtotal;
        const nextLabor = rule.adjustLabor ? rule.adjustLabor(acc.laborHours, context) : acc.laborHours;
        return {
          subtotal: Number(nextSubtotal.toFixed(2)),
          laborHours: Number(nextLabor.toFixed(2)),
        };
      },
      { subtotal, laborHours },
    );
}

function deterministicFallback(context: PricingContext): Omit<Estimate, "estimateId" | "vin"> {
  const lineItems = buildRuleBasedLineItems(context);
  const subtotal = lineItems.reduce((acc, item) => acc + item.total, 0);

  const riskFactor =
    context.riskMultipliers.market *
    context.riskMultipliers.claimFraud *
    context.riskMultipliers.seasonal *
    context.riskMultipliers.partsAvailability;

  const predictedLabor = context.laborPrediction.baseHours;
  const { subtotal: adjustedSubtotal, laborHours } = applyTenantRules(
    subtotal * riskFactor,
    predictedLabor,
    context,
  );

  const laborLine: EstimateLineItem = {
    code: "LABOR",
    description: "Predicted labor",
    quantity: laborHours,
    unitPrice: 85,
    total: Number((laborHours * 85).toFixed(2)),
    confidence: Number(context.laborPrediction.confidence.toFixed(2)),
    source: "rule",
  };

  const finalLineItems = [...lineItems, laborLine];
  const total = Number((adjustedSubtotal + laborLine.total).toFixed(2));

  const recommendedUpsells = generateUpsellRecommendations({
    vin: context.vin,
    vehicleEmbedding: [context.vin.year / 3000, context.vin.mileage / 300000],
    historicalMatches: context.historicalMatches,
    priorJobs: [],
    basePriceAnchor: total,
  });

  return {
    lineItems: finalLineItems,
    laborHours,
    aiJustification:
      "AI unavailable. Generated deterministic estimate from damage severity, tenant rules, labor prediction, and risk multipliers.",
    confidence: 0.68,
    recommendedUpsells,
    total,
    usedFallback: true,
  };
}

function mergeAiAndRuleOutputs(
  context: PricingContext,
  aiResult: Awaited<ReturnType<NonNullable<AiPricingInference>>>,
): Omit<Estimate, "estimateId" | "vin"> {
  const aiSubtotal = aiResult.lineItems.reduce((acc, item) => acc + item.total, 0);

  const riskFactor =
    context.riskMultipliers.market *
    context.riskMultipliers.claimFraud *
    context.riskMultipliers.seasonal *
    context.riskMultipliers.partsAvailability;

  const { subtotal: adjustedSubtotal, laborHours } = applyTenantRules(
    aiSubtotal * riskFactor,
    aiResult.laborHours,
    context,
  );

  const total = Number((adjustedSubtotal + laborHours * 85).toFixed(2));

  const recommendedUpsells = generateUpsellRecommendations({
    vin: context.vin,
    vehicleEmbedding: [context.vin.year / 3000, context.vin.mileage / 300000],
    historicalMatches: context.historicalMatches,
    priorJobs: [],
    basePriceAnchor: total,
  });

  return {
    lineItems: aiResult.lineItems,
    laborHours,
    aiJustification: aiResult.aiJustification,
    confidence: Number(Math.min(Math.max(aiResult.confidence, 0), 1).toFixed(2)),
    recommendedUpsells,
    total,
    usedFallback: false,
  };
}

export async function createEstimate(
  input: PricingEngineInput,
  inferWithAi?: AiPricingInference,
): Promise<Estimate> {
  const context: PricingContext = {
    vin: input.vin,
    damageFindings: input.damageFindings,
    historicalMatches: input.historicalMatches,
    tenantRules: input.tenantRules,
    laborPrediction: input.laborPrediction,
    riskMultipliers: input.riskMultipliers,
  };

  if (!input.aiAvailable || !inferWithAi) {
    const deterministic = deterministicFallback(context);
    return {
      estimateId: `est_${Date.now()}`,
      vin: input.vin.vin,
      ...deterministic,
    };
  }

  try {
    const aiResult = await inferWithAi(context);
    const merged = mergeAiAndRuleOutputs(context, aiResult);

    return {
      estimateId: `est_${Date.now()}`,
      vin: input.vin.vin,
      ...merged,
    };
  } catch {
    const deterministic = deterministicFallback(context);
    return {
      estimateId: `est_${Date.now()}`,
      vin: input.vin.vin,
      ...deterministic,
    };
  }
}
