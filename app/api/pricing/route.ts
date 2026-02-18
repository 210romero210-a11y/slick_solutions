import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";

import { dynamicPricingRequestSchema, dynamicPricingResponseSchema } from "@/lib/intakeSchemas";
import { enrichVehicleFromVin } from "@/lib/vinEnrichment";

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!convexUrl) {
    throw new Error("CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is required for pricing API.");
  }

  return new ConvexHttpClient(convexUrl);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const json = await request.json();
  const parsed = dynamicPricingRequestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const client = getConvexClient();

    const tenant = await (client as any).query("pricing/queries:getTenantBySlug", {
      tenantSlug: parsed.data.tenantSlug,
    });

    if (!tenant?._id) {
      return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
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

    const pricingResult = await (client as any).action("pricing/actions:calculateQuotePricing", {
      tenantId: tenant._id,
      quoteId: parsed.data.quoteId,
      inspectionId: parsed.data.inspectionId,
      vehicleId: parsed.data.vehicleId,
      vin: parsed.data.vin,
      services: parsed.data.services,
      difficultyScore: parsed.data.difficultyScore,
      demandMultiplier: parsed.data.demandMultiplier,
      vehicleSizeMultiplier: parsed.data.vehicleSizeMultiplier,
      addOnsCents: parsed.data.addOnsCents,
      discountCents: parsed.data.discountCents,
    });

    const response = dynamicPricingResponseSchema.parse({
      ...pricingResult,
      vehicleAttributes,
      explanation:
        "Pricing compiled in Convex from tenant-scoped context (services, inspection signals, vehicle data) with ordered active rules from pricingRules.",
    });

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pricing evaluation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
