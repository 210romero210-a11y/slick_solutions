import { NextRequest, NextResponse } from "next/server";

import { assessmentResponseSchema, customerIntakeSchema } from "@/lib/intakeSchemas";
import { runAssessment } from "@/lib/sequentialEngine";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const json = await request.json();
  const parsed = customerIntakeSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await runAssessment(parsed.data);

  const response = assessmentResponseSchema.parse({
    inspectionId: result.record.inspectionId,
    status: "quote_ready",
    difficultyScore: result.record.difficultyScore ?? 0,
    quoteCents: result.record.quoteCents ?? 0,
    timelineCount: result.record.timeline.length,
    analysisSource: result.analysisSource,
    confidence: result.confidence,
    recommendedServices: result.recommendedServices,
    runId: result.runId,
  });

  return NextResponse.json(response, { status: 200 });
}
