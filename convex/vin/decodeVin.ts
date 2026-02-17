import { action } from "../_generated/server";
import { v } from "convex/values";

import { vinDecodedProfileValidator } from "./api";
import { decodeVinProfile } from "./decodeClient";

export const decodeVin = action({
  args: { vin: v.string() },
  returns: vinDecodedProfileValidator,
  handler: async (_ctx: any, args: any) => {
    return await decodeVinProfile(args.vin);
  },
});
