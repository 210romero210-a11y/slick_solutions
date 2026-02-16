import { NextRequest, NextResponse } from "next/server";

import { onboardingRequestSchema, onboardingResponseSchema } from "@/lib/intakeSchemas";
import { provisionTenant } from "@/lib/sequentialEngine";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const json = await request.json();
  const parsed = onboardingRequestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const origin = request.nextUrl.origin;
  const payload = provisionTenant(parsed.data, origin);
  const response = onboardingResponseSchema.parse(payload);

  return NextResponse.json(response, { status: 201 });
}
