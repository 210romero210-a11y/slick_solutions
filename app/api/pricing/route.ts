import { NextRequest, NextResponse } from "next/server";

import { dynamicPricingRequestSchema, dynamicPricingResponseSchema } from "@/lib/intakeSchemas";
import { runDynamicPricing } from "@/lib/sequentialEngine";
import { enrichVehicleFromVin } from "@/lib/vinEnrichment";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const json = await request.json();
  const parsed = dynamicPricingRequestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const vehicleAttributes =
    parsed.data.vehicleAttributes ??
    (parsed.data.vin
      ? await enrichVehicleFromVin(parsed.data.vin)
      : {
          normalizedVehicleClass: "unknown",
          normalizedVehicleSize: "unknown",
          decodedModelYear: null,
          decodeFallbackUsed: true,
        });

  const response = dynamicPricingResponseSchema.parse(
    runDynamicPricing({
      ...parsed.data,
      vehicleAttributes,
    }),
  );
  return NextResponse.json(response, { status: 200 });
}
