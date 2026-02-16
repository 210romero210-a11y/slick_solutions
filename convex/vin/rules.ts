import type {
  PricingModifier,
  UpsellTrigger,
  VinDecodedProfile,
  VinSignalOverrides,
  VinSignals,
} from "./types";

const defaultOverrides: Required<VinSignalOverrides> = {
  heavyVehicleGvwrPattern: "8501|9000|10000|Class 3|Class 4|Class 5",
  highRiskCountries: ["RUSSIA", "BELARUS"],
  sportsTrimPatterns: ["SPORT", "GT", "TYPE R", "M PERFORMANCE", "AMG"],
  largeEngineCylinderThreshold: 8,
  modifierAmounts: {
    heavyDutyAdjustment: 180,
    sportsTrimAdjustment: 130,
    importedVehicleAdjustment: 60,
    ecoDiscount: -45,
  },
};

const mergeOverrides = (
  overrides?: VinSignalOverrides,
): Required<VinSignalOverrides> => ({
  ...defaultOverrides,
  ...overrides,
  modifierAmounts: {
    ...defaultOverrides.modifierAmounts,
    ...(overrides?.modifierAmounts ?? {}),
  },
});

export const computeVinSignals = (
  profile: VinDecodedProfile,
  tenantOverrides?: VinSignalOverrides,
): VinSignals => {
  const settings = mergeOverrides(tenantOverrides);

  const pricingModifiers: PricingModifier[] = [];
  const upsellTriggers: UpsellTrigger[] = [];
  const riskFactors: Array<{ code: string; contribution: number; reason: string }> = [];

  const gvwrRegex = new RegExp(settings.heavyVehicleGvwrPattern, "i");
  if (gvwrRegex.test(profile.gvwr)) {
    pricingModifiers.push({
      code: "HEAVY_DUTY",
      label: "Heavy Duty Vehicle Surcharge",
      amountDelta: settings.modifierAmounts.heavyDutyAdjustment,
      reason: `GVWR indicates heavy duty (${profile.gvwr}).`,
    });
    riskFactors.push({
      code: "HEAVY_DUTY",
      contribution: 18,
      reason: "Higher claim severity expected for heavy duty platforms.",
    });
    upsellTriggers.push({
      code: "HD_COVERAGE",
      label: "Recommend heavy-duty drivetrain coverage",
      reason: "Vehicle classification suggests elevated component wear.",
    });
  }

  const trimLabel = `${profile.trim} ${profile.series}`.toUpperCase();
  if (settings.sportsTrimPatterns.some((pattern) => trimLabel.includes(pattern))) {
    pricingModifiers.push({
      code: "SPORT_TRIM",
      label: "Performance Trim Adjustment",
      amountDelta: settings.modifierAmounts.sportsTrimAdjustment,
      reason: `Performance-oriented trim detected (${profile.trim}/${profile.series}).`,
    });
    riskFactors.push({
      code: "SPORT_TRIM",
      contribution: 14,
      reason: "Performance trims generally correlate with aggressive usage.",
    });
    upsellTriggers.push({
      code: "PERFORMANCE_PACKAGE",
      label: "Offer performance component package",
      reason: "High-value performance components detected.",
    });
  }

  if (
    profile.plantCountry !== "UNKNOWN" &&
    profile.plantCountry.toUpperCase() !== "UNITED STATES (USA)"
  ) {
    pricingModifiers.push({
      code: "IMPORTED_VEHICLE",
      label: "Imported Vehicle Adjustment",
      amountDelta: settings.modifierAmounts.importedVehicleAdjustment,
      reason: `Plant country is ${profile.plantCountry}.`,
    });
    upsellTriggers.push({
      code: "PARTS_DELAY_PROTECTION",
      label: "Offer parts-delay reimbursement",
      reason: "Imported models can have longer parts lead times.",
    });
  }

  if (profile.fuelType.toUpperCase().includes("ELECTRIC")) {
    pricingModifiers.push({
      code: "ECO_DISCOUNT",
      label: "Eco Vehicle Discount",
      amountDelta: settings.modifierAmounts.ecoDiscount,
      reason: "Electric powertrain selected for discount policy.",
    });
    upsellTriggers.push({
      code: "EV_BATTERY",
      label: "Offer EV battery degradation coverage",
      reason: "Electric vehicles benefit from battery-specific products.",
    });
  }

  if (
    profile.engineCylinders !== null &&
    profile.engineCylinders >= settings.largeEngineCylinderThreshold
  ) {
    riskFactors.push({
      code: "LARGE_ENGINE",
      contribution: 12,
      reason: `Engine has ${profile.engineCylinders} cylinders.`,
    });
  }

  if (
    settings.highRiskCountries.some(
      (country) => country.toUpperCase() === profile.plantCountry.toUpperCase(),
    )
  ) {
    riskFactors.push({
      code: "HIGH_RISK_COUNTRY",
      contribution: 20,
      reason: `${profile.plantCountry} is configured as high risk by tenant override.`,
    });
  }

  const riskValue = Math.max(
    1,
    Math.min(100, 20 + riskFactors.reduce((sum, factor) => sum + factor.contribution, 0)),
  );

  return {
    pricingModifiers,
    upsellTriggers,
    risk: {
      value: riskValue,
      factors: riskFactors,
    },
  };
};
