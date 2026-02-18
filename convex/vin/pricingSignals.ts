import { z } from "zod";

import type { VinDecodedProfile } from "./types";

const BODY_CLASS_BUCKETS = ["sedan_hatch_wagon", "suv_cuv", "truck", "van", "coupe_convertible", "other", "unknown"] as const;
const VEHICLE_TYPE_BUCKETS = ["passenger", "multipurpose", "truck", "bus", "trailer", "motorcycle", "incomplete", "low_speed", "other", "unknown"] as const;
const GVWR_BUCKETS = ["light", "medium", "heavy", "unknown"] as const;
const DRIVE_TYPE_BUCKETS = ["fwd", "rwd", "awd_4wd", "other", "unknown"] as const;
const MAKE_RISK_CLASSES = ["low", "standard", "elevated", "high", "unknown"] as const;
const DOOR_CLASSES = ["2_or_less", "3_to_4", "5_or_more", "unknown"] as const;

export const VinPricingSignalSchema = z.object({
  bodyClassBucket: z.enum(BODY_CLASS_BUCKETS),
  vehicleTypeBucket: z.enum(VEHICLE_TYPE_BUCKETS),
  gvwrBucket: z.enum(GVWR_BUCKETS),
  driveTypeBucket: z.enum(DRIVE_TYPE_BUCKETS),
  makeRiskClass: z.enum(MAKE_RISK_CLASSES),
  trimSeriesLuxuryIndex: z.number().int().min(0).max(100),
  ageYears: z.number().int().min(0).max(80).nullable(),
  engineCylinders: z.number().int().min(1).max(24).nullable(),
  doorClass: z.enum(DOOR_CLASSES),
});

export type VinPricingSignalModel = z.infer<typeof VinPricingSignalSchema>;

export const UNKNOWN_VIN_PRICING_SIGNALS: VinPricingSignalModel = {
  bodyClassBucket: "unknown",
  vehicleTypeBucket: "unknown",
  gvwrBucket: "unknown",
  driveTypeBucket: "unknown",
  makeRiskClass: "unknown",
  trimSeriesLuxuryIndex: 0,
  ageYears: null,
  engineCylinders: null,
  doorClass: "unknown",
};

const containsAny = (value: string, tokens: string[]): boolean =>
  tokens.some((token) => value.includes(token));

const parseGvwr = (gvwr: string): number | null => {
  const parsed = gvwr.match(/\d{4,5}/)?.[0];
  if (!parsed) return null;
  const value = Number(parsed);
  return Number.isFinite(value) ? value : null;
};

const parseYear = (modelYear: string): number | null => {
  const year = Number(modelYear);
  return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null;
};

const toBodyClassBucket = (bodyClass: string, vehicleType: string): VinPricingSignalModel["bodyClassBucket"] => {
  const candidate = `${bodyClass} ${vehicleType}`.toLowerCase();
  if (!candidate || candidate.includes("unknown")) return "unknown";
  if (containsAny(candidate, ["truck", "pickup", "chassis cab"])) return "truck";
  if (containsAny(candidate, ["sport utility", "suv", "crossover", "utility"])) return "suv_cuv";
  if (containsAny(candidate, ["van", "minivan", "cargo"])) return "van";
  if (containsAny(candidate, ["coupe", "convertible", "roadster"])) return "coupe_convertible";
  if (containsAny(candidate, ["sedan", "hatchback", "wagon", "liftback"])) return "sedan_hatch_wagon";
  return "other";
};

const toVehicleTypeBucket = (vehicleType: string): VinPricingSignalModel["vehicleTypeBucket"] => {
  const candidate = vehicleType.toLowerCase();
  if (!candidate || candidate.includes("unknown")) return "unknown";
  if (containsAny(candidate, ["passenger car", "passenger"])) return "passenger";
  if (containsAny(candidate, ["multipurpose", "mpv"])) return "multipurpose";
  if (containsAny(candidate, ["truck"])) return "truck";
  if (containsAny(candidate, ["bus"])) return "bus";
  if (containsAny(candidate, ["trailer"])) return "trailer";
  if (containsAny(candidate, ["motorcycle", "motorbike"])) return "motorcycle";
  if (containsAny(candidate, ["incomplete"])) return "incomplete";
  if (containsAny(candidate, ["low speed"])) return "low_speed";
  return "other";
};

const toGvwrBucket = (gvwr: string): VinPricingSignalModel["gvwrBucket"] => {
  const value = parseGvwr(gvwr);
  if (value == null) return "unknown";
  if (value >= 10_000) return "heavy";
  if (value >= 6_000) return "medium";
  return "light";
};

const toDriveTypeBucket = (driveType: string): VinPricingSignalModel["driveTypeBucket"] => {
  const candidate = driveType.toLowerCase();
  if (!candidate || candidate.includes("unknown")) return "unknown";
  if (containsAny(candidate, ["4wd", "awd", "four-wheel", "all-wheel"])) return "awd_4wd";
  if (containsAny(candidate, ["fwd", "front-wheel", "front wheel"])) return "fwd";
  if (containsAny(candidate, ["rwd", "rear-wheel", "rear wheel"])) return "rwd";
  return "other";
};

const toMakeRiskClass = (make: string): VinPricingSignalModel["makeRiskClass"] => {
  const candidate = make.toLowerCase();
  if (!candidate || candidate.includes("unknown")) return "unknown";
  if (["porsche", "ferrari", "lamborghini", "mclaren", "aston martin", "maserati", "bentley", "rolls-royce"].some((m) => candidate.includes(m))) {
    return "high";
  }
  if (["bmw", "mercedes", "audi", "jaguar", "land rover", "lexus", "tesla", "genesis", "cadillac"].some((m) => candidate.includes(m))) {
    return "elevated";
  }
  if (["toyota", "honda", "ford", "chevrolet", "nissan", "hyundai", "kia", "subaru", "mazda", "volkswagen"].some((m) => candidate.includes(m))) {
    return "standard";
  }
  return "low";
};

const toLuxuryIndex = (trim: string, series: string): number => {
  const candidate = `${trim} ${series}`.toLowerCase();
  if (!candidate || candidate.includes("unknown")) return 0;
  let score = 0;
  if (containsAny(candidate, ["limited", "platinum", "signature", "premier", "reserve", "elite", "prestige", "touring"])) score += 35;
  if (containsAny(candidate, ["luxury", "ultimate", "executive", "autobiography", "xle", "ex-l", "denali"])) score += 30;
  if (containsAny(candidate, ["sport", "performance", "m", "amg", "rs", "type r", "gt", "ss"])) score += 20;
  if (containsAny(candidate, ["base", "standard", "work", "fleet", "ls"])) score -= 15;
  return Math.max(0, Math.min(100, score));
};

const toDoorClass = (doors: number | null): VinPricingSignalModel["doorClass"] => {
  if (doors == null || !Number.isFinite(doors)) return "unknown";
  if (doors <= 2) return "2_or_less";
  if (doors <= 4) return "3_to_4";
  return "5_or_more";
};

export function mapVinDecodedProfileToPricingSignals(
  profile: VinDecodedProfile,
  opts: { now?: Date } = {},
): VinPricingSignalModel {
  const now = opts.now ?? new Date();
  const modelYear = parseYear(profile.modelYear);
  const ageYears = modelYear == null ? null : Math.max(0, now.getFullYear() - modelYear);
  const engineCylinders = profile.engineCylinders && profile.engineCylinders > 0 ? profile.engineCylinders : null;

  return VinPricingSignalSchema.parse({
    bodyClassBucket: toBodyClassBucket(profile.bodyClass, profile.vehicleType),
    vehicleTypeBucket: toVehicleTypeBucket(profile.vehicleType),
    gvwrBucket: toGvwrBucket(profile.gvwr),
    driveTypeBucket: toDriveTypeBucket(profile.driveType),
    makeRiskClass: toMakeRiskClass(profile.make),
    trimSeriesLuxuryIndex: toLuxuryIndex(profile.trim, profile.series),
    ageYears,
    engineCylinders,
    doorClass: toDoorClass(profile.doors),
  });
}
