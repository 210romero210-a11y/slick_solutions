import { NextRequest, NextResponse } from "next/server";

import { dynamicPricingRequestSchema, dynamicPricingResponseSchema } from "@/lib/intakeSchemas";
import { runDynamicPricing } from "@/lib/sequentialEngine";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const json = await request.json();
  const parsed = dynamicPricingRequestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const response = dynamicPricingResponseSchema.parse(runDynamicPricing(parsed.data));
  return NextResponse.json(response, { status: 200 });
}
