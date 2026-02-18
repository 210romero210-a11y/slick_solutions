import type { DynamicPricingRequest, DynamicPricingResponse } from "./intakeSchemas";
import { classMultiplier } from "./vinEnrichment";

export function calculateConditionMultiplier(difficultyScore: number): number {
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

export function runDynamicPricingEngine(input: DynamicPricingRequest): DynamicPricingResponse {
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
