import { NextRequest, NextResponse } from "next/server";

import { assessmentResponseSchema, customerIntakeSchema } from "@/lib/intakeSchemas";
import { runAssessment } from "@/lib/sequentialEngine";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const json = await request.json();
  const parsed = customerIntakeSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = runAssessment(parsed.data);

  const response = assessmentResponseSchema.parse({
    inspectionId: result.inspectionId,
    status: "quote_ready",
    difficultyScore: result.difficultyScore ?? 0,
    quoteCents: result.quoteCents ?? 0,
    timelineCount: result.timeline.length,
  });

  return NextResponse.json(response, { status: 200 });
}
