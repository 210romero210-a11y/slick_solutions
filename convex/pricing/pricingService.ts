import { randomUUID } from "crypto";

import {
  AiPricingInference,
  DamageFinding,
  Estimate,
  EstimateLineItem,
  PricingFactorMultipliers,
  PricingArtifact,
  PricingContext,
  PricingEngineInput,
  RuleEvaluationArtifact,
} from "./types";
import { generateUpsellRecommendations } from "../upsell/upsellService";

const DAMAGE_SEVERITY_MULTIPLIER: Record<DamageFinding["severity"], number> = {
  minor: 1,
  moderate: 1.6,
  severe: 2.4,
};

const LABOR_RATE = 85;

const DEFAULT_MULTIPLIERS: PricingFactorMultipliers = {
  vsf: 1,
  cf: 1,
  caf: 1,
  llf: 1,
  mrf: 1,
  rrf: 1,
};

function resolvePricingFactors(context: PricingContext): {
  multipliers: PricingFactorMultipliers;
  upsell: number;
  discounts: number;
} {
  const contextualDefaults: PricingFactorMultipliers = {
    vsf: context.riskMultipliers.market,
    cf: context.riskMultipliers.claimFraud,
    caf: context.riskMultipliers.seasonal,
    llf: context.riskMultipliers.partsAvailability,
    mrf: DEFAULT_MULTIPLIERS.mrf,
    rrf: DEFAULT_MULTIPLIERS.rrf,
  };

  const providedMultipliers = context.pricingFactors?.multipliers;

  return {
    multipliers: {
      vsf: providedMultipliers?.vsf ?? contextualDefaults.vsf,
      cf: providedMultipliers?.cf ?? contextualDefaults.cf,
      caf: providedMultipliers?.caf ?? contextualDefaults.caf,
      llf: providedMultipliers?.llf ?? contextualDefaults.llf,
      mrf: providedMultipliers?.mrf ?? contextualDefaults.mrf,
      rrf: providedMultipliers?.rrf ?? contextualDefaults.rrf,
    },
    upsell: context.pricingFactors?.upsell ?? 0,
    discounts: context.pricingFactors?.discounts ?? 0,
  };
}

function calculateFinalPrice(baseService: number, context: PricingContext): {
  total: number;
  factorExplanations: string[];
  multiplierProduct: number;
  inputs: ReturnType<typeof resolvePricingFactors>;
} {
  const inputs = resolvePricingFactors(context);
  const multiplierProduct =
    inputs.multipliers.vsf *
    inputs.multipliers.cf *
    inputs.multipliers.caf *
    inputs.multipliers.llf *
    inputs.multipliers.mrf *
    inputs.multipliers.rrf;

  const multipliedBase = baseService * multiplierProduct;
  const total = Number((multipliedBase + inputs.upsell - inputs.discounts).toFixed(2));
  const factorExplanations = [
    `Base service subtotal: $${baseService.toFixed(2)}.`,
    `VSF (${inputs.multipliers.vsf.toFixed(4)}) adjusts vehicle-specific complexity.`,
    `CF (${inputs.multipliers.cf.toFixed(4)}) adjusts claim fraud risk.`,
    `CAF (${inputs.multipliers.caf.toFixed(4)}) adjusts seasonality/context.`,
    `LLF (${inputs.multipliers.llf.toFixed(4)}) adjusts local labor/parts logistics.`,
    `MRF (${inputs.multipliers.mrf.toFixed(4)}) adjusts market-rate pressure.`,
    `RRF (${inputs.multipliers.rrf.toFixed(4)}) adjusts regional repair factors.`,
    `Multiplier product: ${multiplierProduct.toFixed(4)}; adjusted subtotal: $${multipliedBase.toFixed(2)}.`,
    `Upsell input: +$${inputs.upsell.toFixed(2)}.`,
    `Discounts input: -$${inputs.discounts.toFixed(2)}.`,
    `Final price = (baseService × vsf × cf × caf × llf × mrf × rrf) + upsell - discounts = $${total.toFixed(2)}.`,
  ];

  return { total, factorExplanations, multiplierProduct, inputs };
}

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
): { subtotal: number; laborHours: number; evaluations: RuleEvaluationArtifact[]; matchedRuleIds: string[] } {
  return context.tenantRules.reduce(
    (acc, rule) => {
      const matched = rule.enabled && rule.appliesTo(context);
      const nextSubtotal = matched && rule.adjustPrice ? rule.adjustPrice(acc.subtotal, context) : acc.subtotal;
      const nextLabor = matched && rule.adjustLabor ? rule.adjustLabor(acc.laborHours, context) : acc.laborHours;
      const roundedSubtotal = Number(nextSubtotal.toFixed(2));
      const roundedLabor = Number(nextLabor.toFixed(2));

      acc.evaluations.push({
        ruleId: rule.id,
        matched,
        subtotalBefore: acc.subtotal,
        subtotalAfter: roundedSubtotal,
        laborHoursBefore: acc.laborHours,
        laborHoursAfter: roundedLabor,
      });

      if (matched) {
        acc.matchedRuleIds.push(rule.id);
      }

      return {
        subtotal: roundedSubtotal,
        laborHours: roundedLabor,
        evaluations: acc.evaluations,
        matchedRuleIds: acc.matchedRuleIds,
      };
    },
    {
      subtotal,
      laborHours,
      evaluations: [] as RuleEvaluationArtifact[],
      matchedRuleIds: [] as string[],
    },
  );
}

function buildArtifact(args: {
  quoteVersion?: number;
  correlationId?: string;
  path: "fallback" | "ai";
  baseSubtotal: number;
  riskMultipliers: PricingContext["riskMultipliers"];
  riskFactor: number;
  subtotalAfterRisk: number;
  subtotalAfterRules: number;
  laborHoursInput: number;
  laborHoursAfterRules: number;
  laborLineTotal: number;
  pricingMultipliers: PricingFactorMultipliers;
  upsellInput: number;
  discountsInput: number;
  matchedRuleIds: string[];
  ruleEvaluations: RuleEvaluationArtifact[];
}): PricingArtifact {
  const multiplierProduct =
    args.pricingMultipliers.vsf *
    args.pricingMultipliers.cf *
    args.pricingMultipliers.caf *
    args.pricingMultipliers.llf *
    args.pricingMultipliers.mrf *
    args.pricingMultipliers.rrf;
  const baseService = args.subtotalAfterRules + args.laborLineTotal;
  const finalTotal = baseService * multiplierProduct + args.upsellInput - args.discountsInput;

  return {
    quoteVersion: args.quoteVersion ?? 1,
    correlationId: args.correlationId ?? randomUUID(),
    path: args.path,
    baseSubtotal: Number(args.baseSubtotal.toFixed(2)),
    riskMultipliers: args.riskMultipliers,
    riskFactor: Number(args.riskFactor.toFixed(4)),
    subtotalAfterRisk: Number(args.subtotalAfterRisk.toFixed(2)),
    subtotalAfterRules: Number(args.subtotalAfterRules.toFixed(2)),
    laborHoursInput: Number(args.laborHoursInput.toFixed(2)),
    laborHoursAfterRules: Number(args.laborHoursAfterRules.toFixed(2)),
    laborRate: LABOR_RATE,
    laborLineTotal: Number(args.laborLineTotal.toFixed(2)),
    matchedRuleIds: args.matchedRuleIds,
    ruleEvaluations: args.ruleEvaluations,
    computedIntermediates: {
      riskMultiplierMarket: args.riskMultipliers.market,
      riskMultiplierClaimFraud: args.riskMultipliers.claimFraud,
      riskMultiplierSeasonal: args.riskMultipliers.seasonal,
      riskMultiplierPartsAvailability: args.riskMultipliers.partsAvailability,
      factorVsf: args.pricingMultipliers.vsf,
      factorCf: args.pricingMultipliers.cf,
      factorCaf: args.pricingMultipliers.caf,
      factorLlf: args.pricingMultipliers.llf,
      factorMrf: args.pricingMultipliers.mrf,
      factorRrf: args.pricingMultipliers.rrf,
      factorProduct: multiplierProduct,
      upsellInput: Number(args.upsellInput.toFixed(2)),
      discountsInput: Number(args.discountsInput.toFixed(2)),
      baseService: Number(baseService.toFixed(2)),
      finalTotal: Number(finalTotal.toFixed(2)),
    },
  };
}

function deterministicFallback(context: PricingContext, input: PricingEngineInput): Omit<Estimate, "estimateId" | "vin"> {
  const lineItems = buildRuleBasedLineItems(context);
  const baseSubtotal = lineItems.reduce((acc, item) => acc + item.total, 0);

  const riskFactor =
    context.riskMultipliers.market *
    context.riskMultipliers.claimFraud *
    context.riskMultipliers.seasonal *
    context.riskMultipliers.partsAvailability;

  const subtotalAfterRisk = baseSubtotal * riskFactor;
  const predictedLabor = context.laborPrediction.baseHours;
  const { subtotal: adjustedSubtotal, laborHours, evaluations, matchedRuleIds } = applyTenantRules(
    subtotalAfterRisk,
    predictedLabor,
    context,
  );

  const laborLine: EstimateLineItem = {
    code: "LABOR",
    description: "Predicted labor",
    quantity: laborHours,
    unitPrice: LABOR_RATE,
    total: Number((laborHours * LABOR_RATE).toFixed(2)),
    confidence: Number(context.laborPrediction.confidence.toFixed(2)),
    source: "rule",
  };

  const finalLineItems = [...lineItems, laborLine];
  const baseService = adjustedSubtotal + laborLine.total;
  const finalPrice = calculateFinalPrice(baseService, context);

  const recommendedUpsells = generateUpsellRecommendations({
    vin: context.vin,
    vehicleEmbedding: [context.vin.year / 3000, context.vin.mileage / 300000],
    historicalMatches: context.historicalMatches,
    priorJobs: [],
    basePriceAnchor: finalPrice.total,
  });

  return {
    lineItems: finalLineItems,
    laborHours,
    aiJustification:
      "AI unavailable. Generated deterministic estimate from damage severity, tenant rules, labor prediction, and risk multipliers.",
    confidence: 0.68,
    recommendedUpsells,
    factorExplanations: finalPrice.factorExplanations,
    total: finalPrice.total,
    usedFallback: true,
    artifact: buildArtifact({
      ...(input.quoteVersion != null ? { quoteVersion: input.quoteVersion } : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      path: "fallback",
      baseSubtotal,
      riskMultipliers: context.riskMultipliers,
      riskFactor,
      subtotalAfterRisk,
      subtotalAfterRules: adjustedSubtotal,
      laborHoursInput: predictedLabor,
      laborHoursAfterRules: laborHours,
      laborLineTotal: laborLine.total,
      pricingMultipliers: finalPrice.inputs.multipliers,
      upsellInput: finalPrice.inputs.upsell,
      discountsInput: finalPrice.inputs.discounts,
      matchedRuleIds,
      ruleEvaluations: evaluations,
    }),
  };
}

function mergeAiAndRuleOutputs(
  context: PricingContext,
  input: PricingEngineInput,
  aiResult: Awaited<ReturnType<NonNullable<AiPricingInference>>>,
): Omit<Estimate, "estimateId" | "vin"> {
  const aiSubtotal = aiResult.lineItems.reduce((acc, item) => acc + item.total, 0);

  const riskFactor =
    context.riskMultipliers.market *
    context.riskMultipliers.claimFraud *
    context.riskMultipliers.seasonal *
    context.riskMultipliers.partsAvailability;

  const subtotalAfterRisk = aiSubtotal * riskFactor;

  const { subtotal: adjustedSubtotal, laborHours, evaluations, matchedRuleIds } = applyTenantRules(
    subtotalAfterRisk,
    aiResult.laborHours,
    context,
  );

  const laborLineTotal = laborHours * LABOR_RATE;
  const baseService = adjustedSubtotal + laborLineTotal;
  const finalPrice = calculateFinalPrice(baseService, context);

  const recommendedUpsells = generateUpsellRecommendations({
    vin: context.vin,
    vehicleEmbedding: [context.vin.year / 3000, context.vin.mileage / 300000],
    historicalMatches: context.historicalMatches,
    priorJobs: [],
    basePriceAnchor: finalPrice.total,
  });

  return {
    lineItems: aiResult.lineItems,
    laborHours,
    aiJustification: aiResult.aiJustification,
    confidence: Number(Math.min(Math.max(aiResult.confidence, 0), 1).toFixed(2)),
    recommendedUpsells,
    factorExplanations: finalPrice.factorExplanations,
    total: finalPrice.total,
    usedFallback: false,
    artifact: buildArtifact({
      ...(input.quoteVersion != null ? { quoteVersion: input.quoteVersion } : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      path: "ai",
      baseSubtotal: aiSubtotal,
      riskMultipliers: context.riskMultipliers,
      riskFactor,
      subtotalAfterRisk,
      subtotalAfterRules: adjustedSubtotal,
      laborHoursInput: aiResult.laborHours,
      laborHoursAfterRules: laborHours,
      laborLineTotal,
      pricingMultipliers: finalPrice.inputs.multipliers,
      upsellInput: finalPrice.inputs.upsell,
      discountsInput: finalPrice.inputs.discounts,
      matchedRuleIds,
      ruleEvaluations: evaluations,
    }),
  };
}

export function replayEstimateTotalFromArtifact(artifact: PricingArtifact): number {
  const { computedIntermediates } = artifact;
  const factorProduct = computedIntermediates.factorProduct ?? 1;
  const upsellInput = computedIntermediates.upsellInput ?? 0;
  const discountsInput = computedIntermediates.discountsInput ?? 0;
  return Number(
    ((artifact.subtotalAfterRules + artifact.laborLineTotal) * factorProduct + upsellInput - discountsInput).toFixed(
      2,
    ),
  );
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
    pricingFactors: input.pricingFactors,
  };

  if (!input.aiAvailable || !inferWithAi) {
    const deterministic = deterministicFallback(context, input);
    return {
      estimateId: `est_${Date.now()}`,
      vin: input.vin.vin,
      ...deterministic,
    };
  }

  try {
    const aiResult = await inferWithAi(context);
    const merged = mergeAiAndRuleOutputs(context, input, aiResult);

    return {
      estimateId: `est_${Date.now()}`,
      vin: input.vin.vin,
      ...merged,
    };
  } catch {
    const deterministic = deterministicFallback(context, input);
    return {
      estimateId: `est_${Date.now()}`,
      vin: input.vin.vin,
      ...deterministic,
    };
  }
}
