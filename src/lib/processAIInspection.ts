import type { VehicleAttributes } from "@slick/contracts";

import type { VisionAgentInput, VisionAssessmentResult } from "./aiRuntime";
import { runVisionAssessment } from "./aiRuntime";
import { createAssessmentRun } from "./assessmentPersistence";
import { normalizeSignals, type NormalizedAISignals, type RawAISignals } from "./aiSignalNormalization";
import { validateSignalsForVehicle } from "./aiSignalValidation";
import { enrichVehicleFromVin } from "./vinEnrichment";

const severityToScore = (severity: VisionAssessmentResult["severity"]): number => {
  switch (severity) {
    case "critical":
      return 92;
    case "high":
      return 76;
    case "medium":
      return 54;
    case "low":
      return 30;
    default: {
      const _never: never = severity;
      return _never;
    }
  }
};

function mapToRawSignals(result: VisionAssessmentResult, photoCount: number): RawAISignals {
  const severityScore = severityToScore(result.severity);
  const impliedCritical = result.severity === "critical" ? Math.max(1, Math.round(photoCount * 0.35)) : 0;

  return {
    panelCount: photoCount,
    contaminationScore: result.summary.toLowerCase().includes("interior") ? 65 : 35,
    severityScore,
    defectCount: Math.round(photoCount * (severityScore / 40)),
    paintConditionScore: severityScore,
    severityBuckets: {
      low: result.severity === "low" ? photoCount : 0,
      medium: result.severity === "medium" ? photoCount : Math.round(photoCount * 0.2),
      high: result.severity === "high" ? Math.max(1, Math.round(photoCount * 0.7)) : 0,
      critical: impliedCritical,
    },
  };
}

export type ProcessAIInspectionInput = {
  tenantSlug: string;
  inspectionId: string;
  vin: string;
  concernNotes?: string;
  photoUrls: string[];
  vehicleAttributes?: VehicleAttributes;
};

export type ProcessAIInspectionOutput = {
  runId: string;
  aiResult: VisionAssessmentResult;
  vehicleAttributes: VehicleAttributes;
  normalizedSignals: NormalizedAISignals;
  validatedSignals: NormalizedAISignals;
  validationReasons: string[];
};

export async function processAIInspection(
  input: ProcessAIInspectionInput,
  deps: {
    runVisionInference?: (payload: VisionAgentInput) => Promise<VisionAssessmentResult>;
  } = {},
): Promise<ProcessAIInspectionOutput> {
  const vehicleAttributes = input.vehicleAttributes ?? (await enrichVehicleFromVin(input.vin));

  const invokeVision = deps.runVisionInference ?? runVisionAssessment;
  const aiResult = await invokeVision({
    tenantSlug: input.tenantSlug,
    vin: input.vin,
    photoUrls: input.photoUrls,
    ...(input.concernNotes ? { concernNotes: input.concernNotes } : {}),
  });

  const preNormalizationPayload = mapToRawSignals(aiResult, input.photoUrls.length);
  const normalizedSignals = normalizeSignals(preNormalizationPayload);
  const validation = validateSignalsForVehicle(normalizedSignals, vehicleAttributes);

  const needsManualReview = validation.wasAdjusted || aiResult.confidence < 0.5;

  const persisted = await createAssessmentRun({
    inspectionId: input.inspectionId,
    tenantSlug: input.tenantSlug,
    vin: input.vin,
    model: aiResult.model,
    source: aiResult.analysisSource === "heuristic" ? "heuristic_fallback" : "ollama",
    severity:
      aiResult.severity === "low"
        ? "minor"
        : aiResult.severity === "medium"
          ? "moderate"
          : aiResult.severity === "high"
            ? "major"
            : "critical",
    confidence: aiResult.confidence,
    summary: aiResult.summary,
    recommendedServices: aiResult.recommendedServices,
    rawResponse: JSON.stringify(preNormalizationPayload),
    preNormalizationPayload,
    postNormalizationPayload: validation.corrected,
    validationAdjustments: validation.corrections,
    validationReasons: validation.reasons,
    needsManualReview,
  });

  return {
    runId: persisted.runId,
    aiResult,
    vehicleAttributes,
    normalizedSignals,
    validatedSignals: validation.corrected,
    validationReasons: validation.reasons,
  };
}
