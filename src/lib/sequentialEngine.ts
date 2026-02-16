import { orchestrateInspection, type InspectionRecord, type PhotoAsset } from "../../convex/workflows";
import type {
  BookingRequest,
  BookingResponse,
  CustomerIntake,
  DynamicPricingRequest,
  DynamicPricingResponse,
  OnboardingRequest,
  OnboardingResponse,
} from "./intakeSchemas";
import { runVisionAssessment } from "./aiRuntime";

const generateId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export function provisionTenant(input: OnboardingRequest, baseUrl: string): OnboardingResponse {
  return {
    tenantId: generateId("tenant"),
    tenantSlug: input.tenantSlug,
    qrLandingUrl: `${baseUrl}/${input.tenantSlug}/inspect`,
    status: "provisioned",
  };
}

function mapPhotoUrls(photoUrls: string[]): PhotoAsset[] {
  return photoUrls.map((url, index) => {
    const label: PhotoAsset["label"] =
      index === 0 ? "front" : index === 1 ? "rear" : index === 2 ? "left" : index === 3 ? "right" : "detail";

    return {
      id: `photo_${index + 1}`,
      url,
      label,
      capturedAt: new Date().toISOString(),
    };
  });
}

export function runAssessment(input: CustomerIntake): InspectionRecord {
  const record: InspectionRecord = {
    inspectionId: input.inspectionId,
    tenantSlug: input.tenantSlug,
    vin: input.vin,
    contact: input.contact,
    photos: mapPhotoUrls(input.photoUrls),
    timeline: [],
  };

  const orchestrated = orchestrateInspection(initialRecord);
  const aiDifficulty = severityToDifficulty(aiResult.severity);

  const blendedDifficulty = clampDifficulty((orchestrated.difficultyScore ?? aiDifficulty) * 0.4 + aiDifficulty * 0.6);

  const record: InspectionRecord = {
    ...orchestrated,
    damageSummary: aiResult.summary,
    difficultyScore: blendedDifficulty,
    quoteCents: estimateQuoteFromDifficulty(blendedDifficulty),
  };

  return {
    record,
    analysisSource: aiResult.analysisSource,
    confidence: aiResult.confidence,
    recommendedServices: aiResult.recommendedServices,
    runId: aiResult.runId,
  };
}

function calculateConditionMultiplier(difficultyScore: number): number {
  if (difficultyScore <= 25) {
    return 1;
  }
  if (difficultyScore <= 50) {
    return 1.12;
  }
  if (difficultyScore <= 75) {
    return 1.24;
  }
  return 1.36;
}

export function runDynamicPricing(input: DynamicPricingRequest): DynamicPricingResponse {
  const appliedConditionMultiplier = calculateConditionMultiplier(input.difficultyScore);
  const subtotalCents = Math.round(
    input.baseServicePriceCents * appliedConditionMultiplier * input.vehicleSizeMultiplier * input.demandMultiplier,
  );
  const totalCents = Math.max(0, subtotalCents + input.addOnsCents - input.discountCents);

  return {
    subtotalCents,
    totalCents,
    appliedConditionMultiplier,
    explanation:
      "Base price adjusted by condition severity, vehicle size, and demand profile. Add-ons and discounts are then applied.",
  };
}

export function createBooking(input: BookingRequest): BookingResponse {
  const depositCents = input.requiresDeposit ? Math.round(input.approvedQuoteCents * 0.2) : 0;

  return {
    bookingId: generateId("booking"),
    status: input.requiresDeposit ? "pending_deposit" : "confirmed",
    depositCents,
    paymentIntentClientSecret: input.requiresDeposit ? `pi_stub_${generateId("secret")}` : null,
  };
}
