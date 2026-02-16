import {
  HistoricalEmbeddingMatch,
  UpsellRecommendation,
  VinAttributes,
} from "../pricing/types";

export interface PriorJobUpsell {
  jobId: string;
  vehicleEmbedding: number[];
  upsells: Array<{
    category: string;
    soldPrice: number;
    accepted: boolean;
  }>;
}

export interface UpsellEngineInput {
  vin: VinAttributes;
  vehicleEmbedding: number[];
  historicalMatches: HistoricalEmbeddingMatch[];
  priorJobs: PriorJobUpsell[];
  basePriceAnchor: number;
}

export const MANDATORY_UPSELL_CATEGORIES = [
  "pet hair",
  "odors",
  "leather care",
  "paint protection",
  "engine bay cleaning",
  "headlight restoration",
  "undercarriage wash",
] as const;

const DEFAULT_UPSELL_PRICE: Record<(typeof MANDATORY_UPSELL_CATEGORIES)[number], number> = {
  "pet hair": 45,
  odors: 60,
  "leather care": 80,
  "paint protection": 120,
  "engine bay cleaning": 50,
  "headlight restoration": 95,
  "undercarriage wash": 40,
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildProbabilityWeightedPrice(
  baseAnchor: number,
  acceptanceProbability: number,
  historicalPrice: number,
  category: string,
): number {
  const floor = DEFAULT_UPSELL_PRICE[category as keyof typeof DEFAULT_UPSELL_PRICE] ?? 35;
  const anchor = Math.max(baseAnchor * 0.1, floor);
  const weighted = anchor * (0.65 + acceptanceProbability * 0.7) + historicalPrice * 0.35;
  return Number(weighted.toFixed(2));
}

function baselineRecommendation(
  category: string,
  basePriceAnchor: number,
  matchConfidence: number,
): UpsellRecommendation {
  const basePrice = DEFAULT_UPSELL_PRICE[category as keyof typeof DEFAULT_UPSELL_PRICE] ?? 35;
  return {
    category,
    probability: Number((0.4 + matchConfidence * 0.3).toFixed(2)),
    recommendedPrice: Number(Math.max(basePrice, basePriceAnchor * 0.08).toFixed(2)),
    rationale: "Mandatory category included using deterministic baseline pricing.",
  };
}

export function generateUpsellRecommendations(input: UpsellEngineInput): UpsellRecommendation[] {
  const similarityByJob = new Map<string, number>();

  for (const priorJob of input.priorJobs) {
    const similarity = cosineSimilarity(input.vehicleEmbedding, priorJob.vehicleEmbedding);
    similarityByJob.set(priorJob.jobId, similarity);
  }

  const matchConfidence =
    input.historicalMatches.length > 0
      ? input.historicalMatches.reduce((acc, match) => acc + match.similarity, 0) /
        input.historicalMatches.length
      : 0;

  const recommendations = MANDATORY_UPSELL_CATEGORIES.map((category) => {
    const observed = input.priorJobs
      .map((job) => {
        const similarity = similarityByJob.get(job.jobId) ?? 0;
        const upsell = job.upsells.find((item) => item.category === category);
        if (!upsell) {
          return null;
        }

        return {
          similarity,
          accepted: upsell.accepted,
          soldPrice: upsell.soldPrice,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (observed.length === 0) {
      return baselineRecommendation(category, input.basePriceAnchor, matchConfidence);
    }

    const weightedAcceptance = observed.reduce((acc, item) => {
      const vote = item.accepted ? 1 : 0;
      return acc + vote * Math.max(item.similarity, 0.1);
    }, 0);

    const normalization = observed.reduce((acc, item) => acc + Math.max(item.similarity, 0.1), 0);
    const acceptanceProbability = Number((weightedAcceptance / normalization).toFixed(2));

    const weightedHistoricalPrice =
      observed.reduce((acc, item) => acc + item.soldPrice * Math.max(item.similarity, 0.1), 0) /
      normalization;

    const recommendedPrice = buildProbabilityWeightedPrice(
      input.basePriceAnchor,
      acceptanceProbability,
      weightedHistoricalPrice,
      category,
    );

    return {
      category,
      probability: acceptanceProbability,
      recommendedPrice,
      rationale: `Probability-weighted strategy from ${observed.length} similar-vehicle jobs.`,
    };
  });

  return recommendations;
}
