import type { VehicleAttributes } from "@slick/contracts";

import { decodeVinProfile } from "../../convex/vin/decodeClient";

const unknownAttributes = (): VehicleAttributes => ({
  normalizedVehicleClass: "unknown",
  normalizedVehicleSize: "unknown",
  decodedModelYear: null,
  decodeFallbackUsed: true,
});

const classifyVehicleClass = (bodyClass: string, vehicleType: string): VehicleAttributes["normalizedVehicleClass"] => {
  const candidate = `${bodyClass} ${vehicleType}`.toLowerCase();
  if (candidate.includes("truck") || candidate.includes("pickup")) return "truck";
  if (candidate.includes("sport utility") || candidate.includes("suv") || candidate.includes("crossover")) return "suv";
  if (candidate.includes("van") || candidate.includes("minivan")) return "van";
  if (candidate.includes("coupe") || candidate.includes("convertible")) return "coupe";
  if (candidate.includes("sedan") || candidate.includes("hatchback") || candidate.includes("wagon")) return "sedan";
  return "unknown";
};

const classifyVehicleSize = (bodyClass: string, gvwr: string): VehicleAttributes["normalizedVehicleSize"] => {
  const body = bodyClass.toLowerCase();
  const gvwrMatch = gvwr.match(/\d{4,5}/);
  const gvwrValue = gvwrMatch ? Number(gvwrMatch[0]) : null;

  if (gvwrValue !== null) {
    if (gvwrValue >= 10_000) return "heavy_duty";
    if (gvwrValue >= 6_000) return "fullsize";
    if (gvwrValue >= 4_000) return "midsize";
    return "compact";
  }

  if (body.includes("heavy")) return "heavy_duty";
  if (body.includes("large") || body.includes("full-size") || body.includes("full size")) return "fullsize";
  if (body.includes("midsize") || body.includes("mid-size") || body.includes("mid size")) return "midsize";
  if (body.includes("compact") || body.includes("subcompact")) return "compact";
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
  try {
    const decoded = await decodeVinProfile(vin);

    return {
      normalizedVehicleClass: classifyVehicleClass(decoded.bodyClass, decoded.vehicleType),
      normalizedVehicleSize: classifyVehicleSize(decoded.bodyClass, decoded.gvwr),
      decodedModelYear: parseModelYear(decoded.modelYear),
      decodeFallbackUsed: false,
    };
  } catch (error) {
    console.warn("vin_decode_failed", {
      vinSuffix: vin.slice(-6),
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return unknownAttributes();
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
