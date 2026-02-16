import { action } from "../_generated/server";
import { v } from "convex/values";
import { normalizeDecodedProfile, normalizeVin } from "./normalize";
import { vinDecodedProfileValidator } from "./api";

export const decodeVin = action({
  args: { vin: v.string() },
  returns: vinDecodedProfileValidator,
  handler: async (_ctx, args) => {
    const normalizedVin = normalizeVin(args.vin);
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
  },
});
