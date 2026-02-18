import {
  AssessmentSubmissionRequestSchema,
  AssessmentSubmissionResponseSchema,
  type AssessmentSubmissionRequest,
} from "@slick/contracts";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { enrichVehicleFromVin } from "@/lib/vinEnrichment";
import { RateLimitExceededError, submitInspection } from "@/lib/submitInspectionGateway";

type RouteContext = {
  params: Promise<{
    tenantSlug: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();
  const parsedBody = AssessmentSubmissionRequestSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        message: "Invalid request payload for self-assessment submission.",
        issues: parsedBody.error.issues,
        correlationId,
      },
      {
        status: 400,
        headers: {
          "x-correlation-id": correlationId,
        },
      },
    );
  }

  const { tenantSlug } = await context.params;
  const vehicleAttributes =
    parsedBody.data.pricing.vehicleAttributes ?? (await enrichVehicleFromVin(parsedBody.data.vehicle.vin));

  const payload: AssessmentSubmissionRequest = {
    ...parsedBody.data,
    tenantSlug,
    pricing: {
      ...parsedBody.data.pricing,
      vehicleAttributes,
    },
  };

  try {
    const response = await submitInspection(payload, correlationId);
    const validatedResponse = AssessmentSubmissionResponseSchema.parse(response);

    return NextResponse.json(validatedResponse, {
      status: 200,
      headers: {
        "x-correlation-id": correlationId,
      },
    });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      const retryAfterSeconds = Math.ceil(error.details.retryAfterMs / 1000);
      return NextResponse.json(
        {
          error: {
            code: "rate_limit_exceeded",
            message: "Request rate limit exceeded for AI inspection submissions.",
            operation: error.details.operation,
            tenantId: error.details.tenantId,
            retryAfterMs: error.details.retryAfterMs,
            retryAfterSeconds,
            limit: {
              maxRequestsPerWindow: error.details.maxRequestsPerWindow,
              rateLimitWindowMs: error.details.rateLimitWindowMs,
              currentCount: error.details.currentCount,
            },
            correlationId,
          },
        },
        {
          status: 429,
          headers: {
            "retry-after": String(retryAfterSeconds),
            "x-correlation-id": correlationId,
          },
        },
      );
    }

    throw error;
  }
}
