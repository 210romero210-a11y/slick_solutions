import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";

import { assessmentResponseSchema, customerIntakeSchema } from "@/lib/intakeSchemas";

function getConvexClient(): ConvexHttpClient | null {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!convexUrl) {
    return null;
  }

  return new ConvexHttpClient(convexUrl);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const json = await request.json();
  const parsed = customerIntakeSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const client = getConvexClient();
  if (!client) {
    return NextResponse.json(
      { error: "Convex URL is not configured. Unable to enqueue AI assessment." },
      { status: 503 },
    );
  }

  const tenant = await (client as any).query("tenants:getTenantBySlug", {
    slug: parsed.data.tenantSlug,
  });

  if (!tenant) {
    return NextResponse.json(
      { error: `Tenant '${parsed.data.tenantSlug}' was not found.` },
      { status: 404 },
    );
  }

  const submission = await (client as any).mutation("ai/submissions:submitInspection", {
    tenantId: tenant.id,
    quoteId: parsed.data.inspectionId,
    imageUrls: parsed.data.photoUrls,
    vin: parsed.data.vin,
    notes: parsed.data.concernNotes,
  });

  const pricing = runDynamicPricing({
    baseServicePriceCents: 53_000,
    difficultyScore: result.record.difficultyScore ?? 0,
    vehicleSizeMultiplier: 1,
    demandMultiplier: 1,
    addOnsCents: 0,
    discountCents: 0,
  });

  const response = assessmentResponseSchema.parse({
    inspectionId: parsed.data.inspectionId,
    status: "quote_ready",
    difficultyScore: 0,
    quoteCents: 0,
    timelineCount: 1,
    analysisSource: "heuristic",
    confidence: 0,
    recommendedServices: parsed.data.selectedServices,
    runId: `${submission.submissionId}`,
  });

  return NextResponse.json(response, { status: 202 });
}
