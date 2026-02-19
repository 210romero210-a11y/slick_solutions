export type RetrievalKind = "pricingRule" | "upsell" | "vin" | "inspectionDamage";

export interface RetrievalExplainability {
  kind: RetrievalKind;
  sourceTable: string;
  sourceIndex: string;
  tenantFilterApplied: boolean;
  matchField: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResultDto {
  score: number;
  recordId: string;
  snippet: string;
  explainability: RetrievalExplainability;
}

export interface RawSearchResult {
  _id: string;
  _score: number;
  tenantId: string;
  snippet: string;
  metadata?: Record<string, unknown>;
}

export function normalizeTopKResults(
  rows: RawSearchResult[],
  tenantId: string,
  topK: number,
  explainabilityBase: Omit<RetrievalExplainability, "metadata">,
): SearchResultDto[] {
  return rows
    .filter((row) => row.tenantId === tenantId)
    .sort((a, b) => b._score - a._score)
    .slice(0, Math.max(1, topK))
    .map((row) => ({
      score: row._score,
      recordId: row._id,
      snippet: row.snippet,
      explainability: {
        ...explainabilityBase,
        ...(row.metadata ? { metadata: row.metadata } : {}),
      },
    }));
}
