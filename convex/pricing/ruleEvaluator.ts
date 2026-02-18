export type PricingServiceInput = {
  code: string;
  description?: string;
  basePriceCents: number;
  quantity: number;
};

export type PricingRuleRecord = {
  _id: string;
  code: string;
  name: string;
  description?: string;
  priority: number;
  isActive: boolean;
  conditions?: {
    serviceCodesAny?: string[];
    minSubtotalCents?: number;
    maxSubtotalCents?: number;
    minDifficultyScore?: number;
    maxDifficultyScore?: number;
    vehicleClassIn?: string[];
  };
  action?: {
    type?: "multiply_subtotal" | "add_cents" | "subtract_cents";
    value?: number;
    target?: "subtotal";
  };
};

export type PricingScopeSignals = {
  difficultyScore?: number;
  demandMultiplier?: number;
  vehicleSizeMultiplier?: number;
  addOnsCents?: number;
  discountCents?: number;
};

export type CompiledPricingContext = {
  tenantId: string;
  quoteId?: string;
  inspectionId?: string;
  vehicleId?: string;
  vehicle?: {
    vin: string;
    make: string;
    model: string;
    year: number;
    trim?: string;
  };
  vehicleClass: string;
  services: PricingServiceInput[];
  inspectionSignals: {
    damageFindingsCount: number;
    severeDamageCount: number;
  };
  requestSignals: PricingScopeSignals;
  pricingRules: PricingRuleRecord[];
};

export type AppliedRule = {
  ruleId: string;
  code: string;
  name: string;
  priority: number;
  subtotalBeforeCents: number;
  subtotalAfterCents: number;
};

export type PricingComputationResult = {
  baseSubtotalCents: number;
  preRuleSubtotalCents: number;
  subtotalCents: number;
  totalCents: number;
  appliedRules: AppliedRule[];
};

function matchesConditions(rule: PricingRuleRecord, context: CompiledPricingContext, subtotalCents: number): boolean {
  if (!rule.conditions) return true;

  const { conditions } = rule;

  if (conditions.serviceCodesAny?.length) {
    const serviceCodes = new Set(context.services.map((service) => service.code));
    if (!conditions.serviceCodesAny.some((code) => serviceCodes.has(code))) return false;
  }

  if (conditions.minSubtotalCents != null && subtotalCents < conditions.minSubtotalCents) return false;
  if (conditions.maxSubtotalCents != null && subtotalCents > conditions.maxSubtotalCents) return false;

  const difficultyScore = context.requestSignals.difficultyScore;
  if (conditions.minDifficultyScore != null && (difficultyScore == null || difficultyScore < conditions.minDifficultyScore)) {
    return false;
  }
  if (conditions.maxDifficultyScore != null && (difficultyScore == null || difficultyScore > conditions.maxDifficultyScore)) {
    return false;
  }

  if (conditions.vehicleClassIn?.length && !conditions.vehicleClassIn.includes(context.vehicleClass)) return false;

  return true;
}

function applyRuleSubtotal(subtotalCents: number, rule: PricingRuleRecord): number {
  if (!rule.action || !rule.action.type || rule.action.value == null) return subtotalCents;

  if (rule.action.type === "multiply_subtotal") return Math.round(subtotalCents * rule.action.value);
  if (rule.action.type === "add_cents") return subtotalCents + Math.round(rule.action.value);
  if (rule.action.type === "subtract_cents") return subtotalCents - Math.round(rule.action.value);

  return subtotalCents;
}

export function computeQuotePricing(context: CompiledPricingContext): PricingComputationResult {
  const baseSubtotalCents = context.services.reduce(
    (acc, service) => acc + Math.round(service.basePriceCents * service.quantity),
    0,
  );

  const signalAdjustedSubtotal = Math.round(
    baseSubtotalCents *
      (context.requestSignals.demandMultiplier ?? 1) *
      (context.requestSignals.vehicleSizeMultiplier ?? 1),
  );

  const activeRules = context.pricingRules.filter((rule) => rule.isActive).sort((a, b) => a.priority - b.priority);

  let runningSubtotal = signalAdjustedSubtotal;
  const appliedRules: AppliedRule[] = [];

  for (const rule of activeRules) {
    if (!matchesConditions(rule, context, runningSubtotal)) continue;

    const subtotalBeforeCents = runningSubtotal;
    runningSubtotal = applyRuleSubtotal(runningSubtotal, rule);

    appliedRules.push({
      ruleId: rule._id,
      code: rule.code,
      name: rule.name,
      priority: rule.priority,
      subtotalBeforeCents,
      subtotalAfterCents: runningSubtotal,
    });
  }

  const totalCents = Math.max(
    0,
    runningSubtotal + (context.requestSignals.addOnsCents ?? 0) - (context.requestSignals.discountCents ?? 0),
  );

  return {
    baseSubtotalCents,
    preRuleSubtotalCents: signalAdjustedSubtotal,
    subtotalCents: runningSubtotal,
    totalCents,
    appliedRules,
  };
}
