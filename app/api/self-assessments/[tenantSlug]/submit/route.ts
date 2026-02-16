import {
  AssessmentSubmissionRequestSchema,
  AssessmentSubmissionResponseSchema,
  type AssessmentSubmissionRequest,
} from "@slick/contracts";
import { NextRequest, NextResponse } from "next/server";

import { runSelfAssessmentPipeline } from "../../../../../convex/workflows";

type RouteContext = {
  params: Promise<{
    tenantSlug: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const parsedBody = AssessmentSubmissionRequestSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        message: "Invalid request payload for self-assessment submission.",
        issues: parsedBody.error.issues,
      },
      { status: 400 },
    );
  }

  const { tenantSlug } = await context.params;
  const payload: AssessmentSubmissionRequest = {
    ...parsedBody.data,
    tenantSlug,
  };

  const response = runSelfAssessmentPipeline(payload);
  const validatedResponse = AssessmentSubmissionResponseSchema.parse(response);

  return NextResponse.json(validatedResponse, {
    status: 200,
  });
}
