import type {
  AISignalPayload,
  AssessmentSubmissionRequest,
  AssessmentSubmissionResponse,
  EstimateLineItem,
  InspectionState,
  SelfAssessmentPhoto,
} from "@slick/contracts";
import { AISignalPayloadSchema } from "@slick/contracts";

import type { VisionAgentInput, VisionAssessmentResult } from "../../src/lib/aiRuntime";
import { runDynamicPricingEngine } from "../../src/lib/pricingEngine";

const nowIso = (): string => new Date().toISOString();

const minimumPhotoCount = 5;

const defaultRunVisionInference = async (input: VisionAgentInput): Promise<VisionAssessmentResult> => {
  const { runVisionAssessment } = await import("../../src/lib/aiRuntime");
  return runVisionAssessment(input);
};

const sanitizeVin = (vin: string): string => vin.trim().toUpperCase();

const toInspectionState = (
  state: InspectionState,
  actor: "customer" | "system" | "agent",
  metadata: Record<string, string | number | boolean>,
): AssessmentSubmissionResponse["timeline"][number] => ({
  state,
  actor,
  at: nowIso(),
  metadata,
});

const inferSignalFallback = (photos: SelfAssessmentPhoto[], hasContamination: boolean): AISignalPayload => {
  const detailShots = photos.filter((photo) => photo.kind === "detail").length;
  const panelShots = photos.filter((photo) => photo.kind !== "detail").length;
  const severityScore = Math.min(100, 25 + detailShots * 14 + panelShots * 6 + (hasContamination ? 12 : 0));

  return {
    summary: "Heuristic fallback generated from submitted photo mix and contamination declaration.",
    severityBucket: severityScore >= 86 ? "critical" : severityScore >= 70 ? "high" : severityScore >= 50 ? "medium" : "low",
    confidence: 0.45,
    contaminationLevel: hasContamination ? "moderate" : "none",
    damageClass: "mixed",
    damageType: detailShots > 0 ? "scratch" : "unknown",
    panelMetrics: {
      totalPanelsObserved: panelShots,
      affectedPanels: Math.min(panelShots, Math.max(1, detailShots + (hasContamination ? 1 : 0))),
      detailPhotos: detailShots,
    },
  };
};

const severityToScore = (severity: VisionAssessmentResult["severityBucket"]): number => {
  switch (severity) {
    case "critical":
      return 90;
    case "high":
      return 75;
    case "medium":
      return 55;
    case "low":
      return 35;
    default: {
      const _exhaustiveCheck: never = severity;
      return _exhaustiveCheck;
    }
  }
};

const confidenceLabelFromScore = (confidence: number): "low" | "medium" | "high" => {
  if (confidence >= 0.8) {
    return "high";
  }
  if (confidence >= 0.55) {
    return "medium";
  }
  return "low";
};

type VisionInference = {
  severityScore: number;
  confidenceScore: number;
  provider: string;
  model: string;
  fallbackUsed: boolean;
  signal: AISignalPayload;
};

export type SelfAssessmentPipelineDeps = {
  runVisionInference?: (input: VisionAgentInput) => Promise<VisionAssessmentResult>;
};

const buildLineItems = (
  basePriceCents: number,
  requestsCeramic: boolean,
  contaminationLevel: AISignalPayload["contaminationLevel"],
): EstimateLineItem[] => {
  const items: EstimateLineItem[] = [
    {
      code: "EXT_CORRECTION",
      name: "Exterior paint correction",
      quantity: 1,
      unitPriceCents: basePriceCents,
      totalPriceCents: basePriceCents,
      source: "base",
    },
  ];

  if (contaminationLevel === "moderate" || contaminationLevel === "heavy") {
    items.push({
      code: "INT_RECONDITION",
      name: "Interior reconditioning",
      quantity: 1,
      unitPriceCents: 24900,
      totalPriceCents: 24900,
      source: "base",
    });
  }

  if (requestsCeramic) {
    items.push({
      code: "CERAMIC_ADDON",
      name: "Ceramic coating add-on",
      quantity: 1,
      unitPriceCents: 39900,
      totalPriceCents: 39900,
      source: "upsell",
    });
  }

  return items;
};

const sumLineItems = (items: EstimateLineItem[]): number => items.reduce((total, item) => total + item.totalPriceCents, 0);

export const runSelfAssessmentPipeline = async (
  request: AssessmentSubmissionRequest,
  deps: SelfAssessmentPipelineDeps = {},
): Promise<AssessmentSubmissionResponse> => {
  const vin = sanitizeVin(request.vehicle.vin);
  const contaminationDeclared = request.assessment.interiorContaminationLevel !== "none";

  const timeline: AssessmentSubmissionResponse["timeline"] = [
    toInspectionState("portal_started", "customer", { tenantSlug: request.tenantSlug }),
    toInspectionState("contact_captured", "customer", { email: request.customer.email }),
    toInspectionState("vin_captured", "customer", { vin }),
    toInspectionState("photos_uploaded", "customer", { photoCount: request.photos.length }),
  ];

  const enoughPhotos = request.photos.length >= minimumPhotoCount;
  if (!enoughPhotos) {
    return {
      inspectionId: request.requestId,
      status: "needs_more_photos",
      message: `Please upload at least ${minimumPhotoCount} photos to generate an estimate.`,
      timeline,
    };
  }

  const photoUrls = request.photos.map((photo) => photo.storageId ?? photo.id);
  const invokeVision = deps.runVisionInference ?? defaultRunVisionInference;

  let visionInference: VisionInference;

  try {
    const visionInput: VisionAgentInput = {
      tenantSlug: request.tenantSlug,
      vin,
      photoUrls,
      ...(request.assessment.notes ? { concernNotes: request.assessment.notes } : {}),
    };

    const visionResult = await invokeVision(visionInput);
    const contaminationAdjustment = contaminationDeclared ? 8 : 0;

    visionInference = {
      severityScore: Math.min(100, severityToScore(visionResult.severityBucket) + contaminationAdjustment),
      confidenceScore: visionResult.confidence,
      provider: visionResult.provider,
      model: visionResult.model,
      fallbackUsed: visionResult.fallbackUsed,
      signal: AISignalPayloadSchema.parse(visionResult.signal),
    };
  } catch {
    visionInference = {
      severityScore: severityToScore(inferSignalFallback(request.photos, contaminationDeclared).severityBucket),
      confidenceScore: 0.45,
      provider: "heuristic",
      model: "threshold-fallback",
      fallbackUsed: true,
      signal: inferSignalFallback(request.photos, contaminationDeclared),
    };
  }

  timeline.push(
    toInspectionState("agent_damage_triage", "agent", {
      model: visionInference.model,
      provider: visionInference.provider,
      fallbackUsed: visionInference.fallbackUsed,
      confidenceScore: Number(visionInference.confidenceScore.toFixed(2)),
    }),
  );

  const lineItems = buildLineItems(
    request.pricing.baseExteriorServicePriceCents,
    request.assessment.requestsCeramicCoating,
    visionInference.signal.contaminationLevel,
  );

  const subtotalInput = sumLineItems(lineItems);
  const pricing = runDynamicPricingEngine({
    baseServicePriceCents: subtotalInput,
    difficultyScore: visionInference.severityScore,
    vehicleSizeMultiplier: 1,
    demandMultiplier: 1,
    addOnsCents: 0,
    discountCents: 0,
    vehicleAttributes: request.pricing.vehicleAttributes,
  });

  const taxCents = Math.round(pricing.totalCents * request.pricing.taxRate);

  timeline.push(
    toInspectionState("agent_cost_estimate", "agent", {
      severityScore: visionInference.severityScore,
      severityBucket: visionInference.signal.severityBucket,
      contaminationLevel: visionInference.signal.contaminationLevel,
      pricingEngineRecomputed: true,
    }),
    toInspectionState("quote_ready", "system", { subtotalCents: pricing.totalCents, taxCents }),
    toInspectionState("quote_delivered", "system", { delivery: "web" }),
  );

  return {
    inspectionId: request.requestId,
    status: "estimate_generated",
    message: "Self-assessment completed and estimate generated.",
    estimate: {
      subtotalCents: pricing.totalCents,
      taxCents,
      totalCents: pricing.totalCents + taxCents,
      currency: request.pricing.currency,
      lineItems,
      confidence: confidenceLabelFromScore(visionInference.confidenceScore),
      appliedVehicleClassMultiplier: pricing.appliedVehicleClassMultiplier,
      vehicleAttributes: pricing.vehicleAttributes,
    },
    timeline,
  };
};
