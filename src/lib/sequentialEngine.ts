import { orchestrateInspection, type InspectionRecord, type PhotoAsset } from "../../convex/workflows";
import type {
  AssessmentResponse,
  BookingRequest,
  BookingResponse,
  CustomerIntake,
  DynamicPricingRequest,
  DynamicPricingResponse,
  OnboardingRequest,
  OnboardingResponse,
} from "./intakeSchemas";
import { getProviderEnvConfig } from "./providerConfig";
import { classMultiplier } from "./vinEnrichment";
import { processAIInspection } from "./processAIInspection";

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


function clampDifficulty(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function estimateQuoteFromDifficulty(difficultyScore: number): number {
  return 53_000 + difficultyScore * 205;
}

export type AssessmentRunResult = {
  record: InspectionRecord;
  analysisSource: AssessmentResponse["analysisSource"];
  confidence: number;
  recommendedServices: string[];
  runId: string;
};

export async function runAssessment(input: CustomerIntake): Promise<AssessmentRunResult> {
  const initializedRecord: InspectionRecord = {
    inspectionId: input.inspectionId,
    tenantSlug: input.tenantSlug,
    vin: input.vin,
    contact: input.contact,
    photos: mapPhotoUrls(input.photoUrls),
    timeline: [],
  };

  const orchestrated = orchestrateInspection(initializedRecord);
  const processedAI = await processAIInspection({
    tenantSlug: input.tenantSlug,
    inspectionId: input.inspectionId,
    vin: input.vin,
    photoUrls: input.photoUrls,
    ...(input.concernNotes ? { concernNotes: input.concernNotes } : {}),
  });
  const aiResult = processedAI.aiResult;
  const aiDifficulty = processedAI.validatedSignals.severityScore;

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
    runId: processedAI.runId,
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
  const vehicleAttributes =
    input.vehicleAttributes ?? {
      normalizedVehicleClass: "unknown",
      normalizedVehicleSize: "unknown",
      decodedModelYear: null,
      decodeFallbackUsed: true,
    };
  const appliedVehicleClassMultiplier = classMultiplier(vehicleAttributes.normalizedVehicleClass);

  const subtotalCents = Math.round(
    input.baseServicePriceCents *
      appliedConditionMultiplier *
      appliedVehicleClassMultiplier *
      input.vehicleSizeMultiplier *
      input.demandMultiplier,
  );
  const totalCents = Math.max(0, subtotalCents + input.addOnsCents - input.discountCents);

  return {
    subtotalCents,
    totalCents,
    appliedConditionMultiplier,
    appliedVehicleClassMultiplier,
    vehicleAttributes,
    explanation:
      "Base price adjusted by condition severity, decoded vehicle class, vehicle size, and demand profile. Add-ons and discounts are then applied.",
  };
}

async function createStripePaymentIntent(input: BookingRequest, amountCents: number): Promise<{
  id: string;
  clientSecret: string;
  createdAt: string;
}> {
  const config = getProviderEnvConfig();
  const body = new URLSearchParams({
    amount: String(amountCents),
    currency: config.stripeCurrency,
    receipt_email: input.customerEmail,
    "metadata[tenantSlug]": input.tenantSlug,
    "metadata[inspectionId]": input.inspectionId,
  });

  const response = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create Stripe PaymentIntent (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as {
    id: string;
    client_secret: string | null;
    created: number;
  };

  if (!payload.client_secret) {
    throw new Error(`Stripe PaymentIntent ${payload.id} did not return a client secret.`);
  }

  return {
    id: payload.id,
    clientSecret: payload.client_secret,
    createdAt: new Date(payload.created * 1000).toISOString(),
  };
}

export async function createBooking(input: BookingRequest): Promise<BookingResponse> {
  const depositCents = input.requiresDeposit ? Math.round(input.approvedQuoteCents * 0.2) : 0;

  if (!input.requiresDeposit) {
    return {
      bookingId: generateId("booking"),
      status: "confirmed",
      depositCents,
      paymentIntentClientSecret: null,
      paymentIntentId: null,
      paymentIntentCreatedAt: null,
    };
  }

  const paymentIntent = await createStripePaymentIntent(input, depositCents);

  return {
    bookingId: generateId("booking"),
    status: "pending_deposit",
    depositCents,
    paymentIntentClientSecret: paymentIntent.clientSecret,
    paymentIntentId: paymentIntent.id,
    paymentIntentCreatedAt: paymentIntent.createdAt,
  };
}
