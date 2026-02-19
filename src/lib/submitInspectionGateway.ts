import type { AssessmentSubmissionRequest, AssessmentSubmissionResponse } from "@slick/contracts";
import { ConvexHttpClient } from "convex/browser";
import { createHash } from "node:crypto";

import {
  ConvexActionCacheRepository,
  ConvexAiUsageLedgerRepository,
  ConvexRateLimitRepository,
} from "../../convex/ai/usageControlAdapters";
import { RateLimitExceededError, UsageController } from "../../convex/ai/usageControls";
import { runSelfAssessmentPipeline } from "../../convex/workflows";

const toInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toFloat = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const getConvexUrl = (): string | null => process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL ?? null;

const createUsageController = (): UsageController | null => {
  const convexUrl = getConvexUrl();
  if (!convexUrl) {
    return null;
  }

  const client = new ConvexHttpClient(convexUrl);

  const adapterClient = client as unknown as {
    mutation: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    query: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  };

  return new UsageController(
    new ConvexAiUsageLedgerRepository(adapterClient),
    new ConvexRateLimitRepository(adapterClient),
    new ConvexActionCacheRepository(adapterClient),
    {
      maxRequestsPerWindow: toInt(process.env.AI_USAGE_DEFAULT_MAX_REQUESTS_PER_WINDOW, 15),
      rateLimitWindowMs: toInt(process.env.AI_USAGE_DEFAULT_RATE_LIMIT_WINDOW_MS, 60_000),
      cacheTtlMs: toInt(process.env.AI_USAGE_CACHE_TTL_MS, 30_000),
      tokenCostUsdPer1k: toFloat(process.env.AI_USAGE_TOKEN_COST_USD_PER_1K, 0.002),
      operationLimits: {
        aiInspection: {
          maxRequestsPerWindow: toInt(process.env.AI_INSPECTION_MAX_REQUESTS_PER_WINDOW, 5),
          rateLimitWindowMs: toInt(process.env.AI_INSPECTION_RATE_LIMIT_WINDOW_MS, 60_000),
        },
      },
    },
  );
};

const usageController = createUsageController();

const buildCacheKey = (payload: AssessmentSubmissionRequest): string =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");

export const submitInspection = async (
  payload: AssessmentSubmissionRequest,
  correlationId: string,
): Promise<AssessmentSubmissionResponse> => {
  if (!usageController) {
    return runSelfAssessmentPipeline(payload);
  }

  const tenantId = payload.tenantSlug;

  return usageController.withCacheRateLimitAndBilling<AssessmentSubmissionResponse, AssessmentSubmissionRequest>({
    tenantId: payload.tenantSlug,
    model: "inspection-orchestrator",
    operation: "aiInspection",
    cacheKey: buildCacheKey(payload),
    args: payload,
    estimateInputTokens: (request) => Math.ceil(JSON.stringify(request).length / 4),
    estimateOutputTokens: (result) => Math.ceil(JSON.stringify(result).length / 4),
    execute: async () => runSelfAssessmentPipeline(payload),
    metadata: {
      correlationId,
      requestId: payload.requestId,
    },
  });
};

export { RateLimitExceededError };
