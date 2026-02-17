import { normalizeDecodedProfile, normalizeVin } from "./normalize";
import type { VinDecodedProfile } from "./types";

export async function decodeVinProfile(vin: string): Promise<VinDecodedProfile> {
  const normalizedVin = normalizeVin(vin);
  if (normalizedVin.length !== 17) {
    throw new Error("VIN must be 17 alphanumeric characters after normalization.");
  }

  const response = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${normalizedVin}?format=json`,
  );

  if (!response.ok) {
    throw new Error(`NHTSA decode failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    Results?: Array<Record<string, unknown>>;
  };

  const first = payload.Results?.[0];
  if (!first) {
    throw new Error("NHTSA returned no decode results.");
  }

  return normalizeDecodedProfile(first);
}
