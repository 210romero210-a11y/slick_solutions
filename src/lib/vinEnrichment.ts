import type { VehicleAttributes } from "@slick/contracts";

import { decodeVinProfile } from "../../convex/vin/decodeClient";
import {
  mapVinDecodedProfileToPricingSignals,
  UNKNOWN_VIN_PRICING_SIGNALS,
  type VinPricingSignalModel,
} from "../../convex/vin/pricingSignals";

const unknownAttributes = (): VehicleAttributes => ({
  normalizedVehicleClass: "unknown",
  normalizedVehicleSize: "unknown",
  decodedModelYear: null,
  decodeFallbackUsed: true,
});

const classifyVehicleClass = (signals: VinPricingSignalModel): VehicleAttributes["normalizedVehicleClass"] => {
  switch (signals.bodyClassBucket) {
    case "truck":
      return "truck";
    case "suv_cuv":
      return "suv";
    case "van":
      return "van";
    case "coupe_convertible":
      return "coupe";
    case "sedan_hatch_wagon":
      return "sedan";
    default:
      return "unknown";
  }
};

const classifyVehicleSize = (signals: VinPricingSignalModel): VehicleAttributes["normalizedVehicleSize"] => {
  if (signals.gvwrBucket === "heavy") return "heavy_duty";
  if (signals.gvwrBucket === "medium") return "fullsize";
  if (signals.gvwrBucket === "light") {
    return signals.bodyClassBucket === "truck" || signals.bodyClassBucket === "suv_cuv" ? "midsize" : "compact";
  }
  return "unknown";
};

const parseModelYear = (value: string): number | null => {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    return null;
  }
  return year;
};

export async function enrichVehicleFromVin(vin: string): Promise<VehicleAttributes> {
  const enriched = await enrichVehicleSignalsFromVin(vin);
  return enriched.vehicleAttributes;
}

export async function enrichVehicleSignalsFromVin(
  vin: string,
): Promise<{ vehicleAttributes: VehicleAttributes; pricingSignals: VinPricingSignalModel }> {
  try {
    const decoded = await decodeVinProfile(vin);
    const pricingSignals = mapVinDecodedProfileToPricingSignals(decoded);

    return {
      vehicleAttributes: {
        normalizedVehicleClass: classifyVehicleClass(pricingSignals),
        normalizedVehicleSize: classifyVehicleSize(pricingSignals),
        decodedModelYear: parseModelYear(decoded.modelYear),
        decodeFallbackUsed: false,
      },
      pricingSignals,
    };
  } catch (error) {
    console.warn("vin_decode_failed", {
      vinSuffix: vin.slice(-6),
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return {
      vehicleAttributes: unknownAttributes(),
      pricingSignals: UNKNOWN_VIN_PRICING_SIGNALS,
    };
  }
}

export function classMultiplier(vehicleClass: VehicleAttributes["normalizedVehicleClass"]): number {
  switch (vehicleClass) {
    case "truck":
      return 1.18;
    case "van":
      return 1.12;
    case "suv":
      return 1.08;
    case "coupe":
      return 1.04;
    case "sedan":
      return 1;
    default:
      return 1;
  }
}
