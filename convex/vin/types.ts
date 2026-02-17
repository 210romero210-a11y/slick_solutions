export type VinDecodedProfile = {
  bodyClass: string;
  vehicleType: string;
  make: string;
  model: string;
  modelYear: string;
  trim: string;
  series: string;
  doors: number | null;
  gvwr: string;
  driveType: string;
  engineCylinders: number | null;
  fuelType: string;
  plantCountry: string;
};

export type PricingModifier = {
  code: string;
  label: string;
  amountDelta: number;
  reason: string;
};

export type UpsellTrigger = {
  code: string;
  label: string;
  reason: string;
};

export type RiskScoreBreakdown = {
  value: number;
  factors: Array<{ code: string; contribution: number; reason: string }>;
};

export type VinSignalOverrides = {
  heavyVehicleGvwrPattern?: string;
  highRiskCountries?: string[];
  sportsTrimPatterns?: string[];
  largeEngineCylinderThreshold?: number;
  modifierAmounts?: {
    heavyDutyAdjustment?: number;
    sportsTrimAdjustment?: number;
    importedVehicleAdjustment?: number;
    ecoDiscount?: number;
  };
};

export type VinSignals = {
  pricingModifiers: PricingModifier[];
  upsellTriggers: UpsellTrigger[];
  risk: RiskScoreBreakdown;
};

export type VinQuoteFlowResponse = {
  vin: string;
  profile: VinDecodedProfile;
  signals: VinSignals;
  profileId: string;
  embeddingVectorLength: number;
};
