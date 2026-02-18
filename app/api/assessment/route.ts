import { NextRequest, NextResponse } from "next/server";

import { assessmentResponseSchema, customerIntakeSchema } from "@/lib/intakeSchemas";
import { runAssessment, runDynamicPricing } from "@/lib/sequentialEngine";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const json = await request.json();
  const parsed = customerIntakeSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await runAssessment(parsed.data);

  const pricing = runDynamicPricing({
    baseServicePriceCents: 53_000,
    difficultyScore: result.record.difficultyScore ?? 0,
    vehicleSizeMultiplier: 1,
    demandMultiplier: 1,
    addOnsCents: 0,
    discountCents: 0,
  });

  const response = assessmentResponseSchema.parse({
    inspectionId: result.record.inspectionId,
    status: "quote_ready",
    difficultyScore: result.record.difficultyScore ?? 0,
    quoteCents: pricing.totalCents,
    timelineCount: result.record.timeline.length,
    analysisSource: result.analysisSource,
    confidence: result.confidence,
    signal: result.signal,
    runId: result.runId,
  });

  return NextResponse.json(response, { status: 200 });
}
