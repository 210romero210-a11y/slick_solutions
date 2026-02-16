import { NextRequest, NextResponse } from "next/server";

import { assessmentResponseSchema, customerIntakeSchema } from "@/lib/intakeSchemas";
import { runAssessmentWithVision } from "@/lib/sequentialEngine";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const json = await request.json();
  const parsed = customerIntakeSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await runAssessmentWithVision(parsed.data);

  const response = assessmentResponseSchema.parse({
    inspectionId: result.inspection.inspectionId,
    status: "quote_ready",
    difficultyScore: result.inspection.difficultyScore ?? 0,
    quoteCents: result.inspection.quoteCents ?? 0,
    timelineCount: result.inspection.timeline.length,
    ai: {
      source: result.vision.source,
      severity: result.vision.finding.severity,
      confidence: result.vision.finding.confidence,
      summary: result.vision.finding.summary,
      recommendedServices: result.vision.finding.recommendedServices,
      model: result.vision.model,
    },
    assessmentRunId: result.run.runId,
    needsManualReview: result.run.needsManualReview,
    reviewStatus: result.run.reviewStatus,
  });

  return NextResponse.json(response, { status: 200 });
}
