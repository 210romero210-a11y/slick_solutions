import { action } from "../_generated/server";
import { enforceActionRateLimit } from "../model/actionRateLimit";
import { v } from "convex/values";

import { vinDecodedProfileValidator } from "./api";
import { decodeVinProfile } from "./decodeClient";

export const decodeVin = action({
  args: { vin: v.string() },
  returns: vinDecodedProfileValidator,
  handler: async (ctx: any, args: any) => {
    await enforceActionRateLimit(ctx, {
      tenantKey: `vin:${args.vin.slice(0, 8).toUpperCase()}`,
      operation: "vin.decode",
      maxRequestsPerWindow: 40,
      windowMs: 60_000,
    });

    return await decodeVinProfile(args.vin);
  },
});
