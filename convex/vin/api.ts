import { v } from "convex/values";

export const vinDecodedProfileValidator = v.object({
  bodyClass: v.string(),
  vehicleType: v.string(),
  make: v.string(),
  model: v.string(),
  modelYear: v.string(),
  trim: v.string(),
  series: v.string(),
  doors: v.union(v.number(), v.null()),
  gvwr: v.string(),
  driveType: v.string(),
  engineCylinders: v.union(v.number(), v.null()),
  fuelType: v.string(),
  plantCountry: v.string(),
});

export const vinSignalOverridesValidator = v.object({
  heavyVehicleGvwrPattern: v.optional(v.string()),
  highRiskCountries: v.optional(v.array(v.string())),
  sportsTrimPatterns: v.optional(v.array(v.string())),
  largeEngineCylinderThreshold: v.optional(v.number()),
  modifierAmounts: v.optional(
    v.object({
      heavyDutyAdjustment: v.optional(v.number()),
      sportsTrimAdjustment: v.optional(v.number()),
      importedVehicleAdjustment: v.optional(v.number()),
      ecoDiscount: v.optional(v.number()),
    }),
  ),
});

export const vinSignalValidator = v.object({
  pricingModifiers: v.array(
    v.object({
      code: v.string(),
      label: v.string(),
      amountDelta: v.number(),
      reason: v.string(),
    }),
  ),
  upsellTriggers: v.array(
    v.object({
      code: v.string(),
      label: v.string(),
      reason: v.string(),
    }),
  ),
  risk: v.object({
    value: v.number(),
    factors: v.array(
      v.object({
        code: v.string(),
        contribution: v.number(),
        reason: v.string(),
      }),
    ),
  }),
});

export const vinQuoteRequestValidator = v.object({
  tenantId: v.id("tenants"),
  vehicleId: v.id("vehicles"),
  vin: v.string(),
  overrides: v.optional(vinSignalOverridesValidator),
  ollamaModel: v.optional(v.string()),
  ollamaEndpoint: v.optional(v.string()),
});

export const vinQuoteResponseValidator = v.object({
  vin: v.string(),
  profile: vinDecodedProfileValidator,
  signals: vinSignalValidator,
  profileId: v.id("vinProfiles"),
  embeddingVectorLength: v.number(),
});
