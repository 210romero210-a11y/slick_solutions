export type RawAISignals = {
  panelCount?: unknown;
  contaminationScore?: unknown;
  severityScore?: unknown;
  defectCount?: unknown;
  paintConditionScore?: unknown;
  severityBuckets?: {
    low?: unknown;
    medium?: unknown;
    high?: unknown;
    critical?: unknown;
  };
};

export type NormalizedAISignals = {
  panelCount: number;
  contaminationScore: number;
  severityScore: number;
  defectCount: number;
  paintConditionScore: number;
  severityBuckets: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const coerceNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

const roundCount = (value: unknown, max: number): number => Math.round(clamp(coerceNumber(value), 0, max));
const roundScore = (value: unknown): number => Math.round(clamp(coerceNumber(value), 0, 100));

export function normalizeSignals(raw: RawAISignals): NormalizedAISignals {
  return {
    panelCount: roundCount(raw.panelCount, 24),
    contaminationScore: roundScore(raw.contaminationScore),
    severityScore: roundScore(raw.severityScore),
    defectCount: roundCount(raw.defectCount, 250),
    paintConditionScore: roundScore(raw.paintConditionScore),
    severityBuckets: {
      low: roundCount(raw.severityBuckets?.low, 24),
      medium: roundCount(raw.severityBuckets?.medium, 24),
      high: roundCount(raw.severityBuckets?.high, 24),
      critical: roundCount(raw.severityBuckets?.critical, 24),
    },
  };
}
