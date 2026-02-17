import { NextRequest, NextResponse } from "next/server";

import { getAssessmentRun, reviewAssessmentRun } from "@/lib/assessmentPersistence";
import { assessmentReviewRequestSchema, assessmentReviewResponseSchema } from "@/lib/intakeSchemas";


export async function GET(request: NextRequest): Promise<NextResponse> {
  const runId = request.nextUrl.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json({ error: "runId query parameter is required" }, { status: 400 });
  }

  const run = await getAssessmentRun(runId);

  if (!run) {
    return NextResponse.json({ error: "Assessment run not found" }, { status: 404 });
  }

  const response = assessmentReviewResponseSchema.parse({
    runId: run.runId,
    reviewStatus: run.reviewStatus,
    reviewedBy: run.reviewedBy,
    reviewedAt: run.reviewedAt,
    reviewNotes: run.reviewNotes,
  });

  return NextResponse.json(response, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const json = await request.json();
  const parsed = assessmentReviewRequestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await reviewAssessmentRun({
    runId: parsed.data.runId,
    reviewer: parsed.data.reviewer,
    status: parsed.data.status,
    ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
  });

  if (!updated) {
    return NextResponse.json({ error: "Assessment run not found" }, { status: 404 });
  }

  const response = assessmentReviewResponseSchema.parse({
    runId: updated.runId,
    reviewStatus: updated.reviewStatus,
    reviewedBy: updated.reviewedBy,
    reviewedAt: updated.reviewedAt,
    reviewNotes: updated.reviewNotes,
  });

  return NextResponse.json(response, { status: 200 });
}
