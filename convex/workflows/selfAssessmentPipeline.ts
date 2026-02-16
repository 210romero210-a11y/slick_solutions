import {
  AssessmentSubmissionRequest,
  AssessmentSubmissionResponse,
  EstimateLineItem,
  InspectionState,
  SelfAssessmentPhoto,
} from "@slick/contracts";

const nowIso = (): string => new Date().toISOString();

const minimumPhotoCount = 5;

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

const inferSeverityScore = (photos: SelfAssessmentPhoto[], hasContamination: boolean): number => {
  const detailShots = photos.filter((photo) => photo.kind === "detail").length;
  const panelShots = photos.filter((photo) => photo.kind !== "detail").length;
  const contaminationBonus = hasContamination ? 12 : 0;

  return Math.min(100, 25 + detailShots * 14 + panelShots * 6 + contaminationBonus);
};

const buildLineItems = (
  basePriceCents: number,
  severityScore: number,
  requestsCeramic: boolean,
): EstimateLineItem[] => {
  const conditionMultiplier = 1 + severityScore / 250;
  const correctionPrice = Math.round(basePriceCents * conditionMultiplier);

  const items: EstimateLineItem[] = [
    {
      code: "EXT_CORRECTION",
      name: "Exterior paint correction",
      quantity: 1,
      unitPriceCents: correctionPrice,
      totalPriceCents: correctionPrice,
      source: "ai_dynamic",
    },
    {
      code: "INT_RECONDITION",
      name: "Interior reconditioning",
      quantity: 1,
      unitPriceCents: 24900,
      totalPriceCents: 24900,
      source: "base",
    },
  ];

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

const sumLineItems = (items: EstimateLineItem[]): number =>
  items.reduce((total, item) => total + item.totalPriceCents, 0);

export const runSelfAssessmentPipeline = (
  request: AssessmentSubmissionRequest,
): AssessmentSubmissionResponse => {
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

  timeline.push(
    toInspectionState("agent_damage_triage", "agent", {
      model: "llama3.2-vision",
      provider: "ollama-cloud",
    }),
  );

  const severityScore = inferSeverityScore(request.photos, contaminationDeclared);
  const lineItems = buildLineItems(
    request.pricing.baseExteriorServicePriceCents,
    severityScore,
    request.assessment.requestsCeramicCoating,
  );
  const subtotalCents = sumLineItems(lineItems);
  const taxCents = Math.round(subtotalCents * request.pricing.taxRate);

  timeline.push(
    toInspectionState("agent_cost_estimate", "agent", { severityScore }),
    toInspectionState("quote_ready", "system", { subtotalCents, taxCents }),
    toInspectionState("quote_delivered", "system", { delivery: "web" }),
  );

  return {
    inspectionId: request.requestId,
    status: "estimate_generated",
    message: "Self-assessment completed and estimate generated.",
    estimate: {
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
      currency: request.pricing.currency,
      lineItems,
      confidence: severityScore >= 65 ? "high" : "medium",
    },
    timeline,
  };
};
