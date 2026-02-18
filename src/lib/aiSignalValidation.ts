import type { VehicleAttributes } from "@slick/contracts";

import type { NormalizedAISignals } from "./aiSignalNormalization";

type VehicleClass = VehicleAttributes["normalizedVehicleClass"];

type ValidationCorrection = {
  field: keyof NormalizedAISignals | "severityBuckets";
  from: unknown;
  to: unknown;
  reason: string;
};

export type AISignalValidationResult = {
  normalized: NormalizedAISignals;
  corrected: NormalizedAISignals;
  wasAdjusted: boolean;
  corrections: ValidationCorrection[];
  reasons: string[];
};

const classPanelRange: Record<VehicleClass, { min: number; max: number }> = {
  sedan: { min: 8, max: 14 },
  coupe: { min: 8, max: 14 },
  suv: { min: 10, max: 18 },
  truck: { min: 10, max: 20 },
  van: { min: 10, max: 22 },
  unknown: { min: 6, max: 22 },
};

const maxPaintByClass: Record<VehicleClass, number> = {
  sedan: 100,
  coupe: 100,
  suv: 95,
  truck: 92,
  van: 90,
  unknown: 100,
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export function validateSignalsForVehicle(
  normalized: NormalizedAISignals,
  vehicle: VehicleAttributes,
): AISignalValidationResult {
  const corrections: ValidationCorrection[] = [];
  const reasons: string[] = [];

  const corrected: NormalizedAISignals = {
    ...normalized,
    severityBuckets: { ...normalized.severityBuckets },
  };

  const panelRange = classPanelRange[vehicle.normalizedVehicleClass];
  const correctedPanelCount = clamp(corrected.panelCount, panelRange.min, panelRange.max);
  if (correctedPanelCount !== corrected.panelCount) {
    corrections.push({
      field: "panelCount",
      from: corrected.panelCount,
      to: correctedPanelCount,
      reason: `panelCount out of expected range for vehicle class ${vehicle.normalizedVehicleClass}`,
    });
    reasons.push(`Adjusted panelCount for vehicle class ${vehicle.normalizedVehicleClass}.`);
    corrected.panelCount = correctedPanelCount;
  }

  const maxPaintScore = maxPaintByClass[vehicle.normalizedVehicleClass];
  if (corrected.paintConditionScore > maxPaintScore) {
    corrections.push({
      field: "paintConditionScore",
      from: corrected.paintConditionScore,
      to: maxPaintScore,
      reason: `paintConditionScore exceeds class compatibility for ${vehicle.normalizedVehicleClass}`,
    });
    reasons.push("Adjusted paintConditionScore to remain class-compatible.");
    corrected.paintConditionScore = maxPaintScore;
  }

  const bucketTotal =
    corrected.severityBuckets.low +
    corrected.severityBuckets.medium +
    corrected.severityBuckets.high +
    corrected.severityBuckets.critical;

  if (bucketTotal > corrected.panelCount && bucketTotal > 0) {
    const ratio = corrected.panelCount / bucketTotal;
    const rebalanced = {
      low: Math.round(corrected.severityBuckets.low * ratio),
      medium: Math.round(corrected.severityBuckets.medium * ratio),
      high: Math.round(corrected.severityBuckets.high * ratio),
      critical: Math.round(corrected.severityBuckets.critical * ratio),
    };

    corrections.push({
      field: "severityBuckets",
      from: corrected.severityBuckets,
      to: rebalanced,
      reason: "severity buckets exceeded panelCount and were rebalanced",
    });
    reasons.push("Rebalanced severity buckets to not exceed panelCount.");
    corrected.severityBuckets = rebalanced;
  }

  if (corrected.defectCount < corrected.severityBuckets.critical) {
    corrections.push({
      field: "defectCount",
      from: corrected.defectCount,
      to: corrected.severityBuckets.critical,
      reason: "defectCount cannot be lower than critical bucket count",
    });
    reasons.push("Raised defectCount to align with critical bucket count.");
    corrected.defectCount = corrected.severityBuckets.critical;
  }

  return {
    normalized,
    corrected,
    wasAdjusted: corrections.length > 0,
    corrections,
    reasons,
  };
}
