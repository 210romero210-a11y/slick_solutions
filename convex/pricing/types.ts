export type DamageSeverity = "minor" | "moderate" | "severe";

export interface VinAttributes {
  vin: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  trim?: string;
}

export interface DamageFinding {
  panel: string;
  type: string;
  severity: DamageSeverity;
  confidence: number;
}

export interface HistoricalEmbeddingMatch {
  jobId: string;
  similarity: number;
  totalPrice: number;
  laborHours: number;
  tags: string[];
}

export interface TenantRule {
  id: string;
  description: string;
  enabled: boolean;
  appliesTo: (ctx: PricingContext) => boolean;
  adjustPrice?: (subtotal: number, ctx: PricingContext) => number;
  adjustLabor?: (laborHours: number, ctx: PricingContext) => number;
}

export interface LaborPrediction {
  baseHours: number;
  confidence: number;
  componentHours: Record<string, number>;
}

export interface RiskMultipliers {
  market: number;
  claimFraud: number;
  seasonal: number;
  partsAvailability: number;
}

export interface UpsellRecommendation {
  category: string;
  probability: number;
  recommendedPrice: number;
  rationale: string;
}

export interface EstimateLineItem {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  confidence: number;
  source: "rule" | "historical" | "ai";
}

export interface RuleEvaluationArtifact {
  ruleId: string;
  matched: boolean;
  subtotalBefore: number;
  subtotalAfter: number;
  laborHoursBefore: number;
  laborHoursAfter: number;
}

export interface PricingArtifact {
  quoteVersion: number;
  correlationId: string;
  path: "fallback" | "ai";
  baseSubtotal: number;
  riskMultipliers: RiskMultipliers;
  riskFactor: number;
  subtotalAfterRisk: number;
  subtotalAfterRules: number;
  laborHoursInput: number;
  laborHoursAfterRules: number;
  laborRate: number;
  laborLineTotal: number;
  matchedRuleIds: string[];
  ruleEvaluations: RuleEvaluationArtifact[];
  computedIntermediates: Record<string, number>;
}

export interface Estimate {
  estimateId: string;
  vin: string;
  lineItems: EstimateLineItem[];
  laborHours: number;
  aiJustification: string;
  confidence: number;
  recommendedUpsells: UpsellRecommendation[];
  total: number;
  usedFallback: boolean;
  artifact?: PricingArtifact;
}

export interface PricingContext {
  vin: VinAttributes;
  damageFindings: DamageFinding[];
  historicalMatches: HistoricalEmbeddingMatch[];
  tenantRules: TenantRule[];
  laborPrediction: LaborPrediction;
  riskMultipliers: RiskMultipliers;
}

export interface PricingEngineInput extends PricingContext {
  aiAvailable: boolean;
  quoteVersion?: number;
  correlationId?: string;
}

export interface AiPricingResult {
  lineItems: EstimateLineItem[];
  laborHours: number;
  aiJustification: string;
  confidence: number;
}

export type AiPricingInference = (context: PricingContext) => Promise<AiPricingResult>;
