import type { VinDecodedProfile } from "./types";

const EMPTY = "UNKNOWN";

const nullLike = new Set([
  "",
  "0",
  "NOT APPLICABLE",
  "NULL",
  "N/A",
  "NONE",
  "-",
]);

const coalesce = (...values: Array<unknown>): string => {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!nullLike.has(trimmed.toUpperCase())) {
      return trimmed;
    }
  }

  return EMPTY;
};

export const normalizeVin = (vin: string): string =>
  vin.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

const toNullableNumber = (value: string): number | null => {
  const match = value.match(/\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const required = (value: string): string => (value === EMPTY ? EMPTY : value);

export const normalizeDecodedProfile = (
  raw: Record<string, unknown>,
): VinDecodedProfile => {
  const doors = toNullableNumber(coalesce(raw.Doors));
  const engineCylinders = toNullableNumber(
    coalesce(raw.EngineCylinders, raw.DisplacementL),
  );

  return {
    bodyClass: required(coalesce(raw.BodyClass, raw.BodyType)),
    vehicleType: required(coalesce(raw.VehicleType)),
    make: required(coalesce(raw.Make)),
    model: required(coalesce(raw.Model)),
    modelYear: required(coalesce(raw.ModelYear)),
    trim: required(coalesce(raw.Trim, raw.Trim2)),
    series: required(coalesce(raw.Series, raw.Series2)),
    doors,
    gvwr: required(coalesce(raw.GVWR, raw.GVWR_from, raw.GVWR_to)),
    driveType: required(coalesce(raw.DriveType, raw.DriveTypeDesc)),
    engineCylinders,
    fuelType: required(coalesce(raw.FuelTypePrimary, raw.FuelTypeSecondary)),
    plantCountry: required(
      coalesce(raw.PlantCountry, raw.ManufacturerPlantCountry),
    ),
  };
};

export const buildEmbeddingText = (profile: VinDecodedProfile): string =>
  [
    `Make: ${profile.make}`,
    `Model: ${profile.model}`,
    `Model Year: ${profile.modelYear}`,
    `Trim: ${profile.trim}`,
    `Series: ${profile.series}`,
    `Body Class: ${profile.bodyClass}`,
    `Vehicle Type: ${profile.vehicleType}`,
    `Doors: ${profile.doors ?? "UNKNOWN"}`,
    `GVWR: ${profile.gvwr}`,
    `Drive Type: ${profile.driveType}`,
    `Engine Cylinders: ${profile.engineCylinders ?? "UNKNOWN"}`,
    `Fuel Type: ${profile.fuelType}`,
    `Plant Country: ${profile.plantCountry}`,
  ].join("\n");
