import type { AssessmentSubmissionRequest, AssessmentSubmissionResponse } from "@slick/contracts";
import { createHash } from "node:crypto";

import { runSelfAssessmentPipeline } from "../../convex/workflows";
import {
  type ActionCacheRepository,
  type AiUsageLedgerEntry,
  type AiUsageLedgerRepository,
  type RateLimitRepository,
  RateLimitExceededError,
  UsageController,
} from "../../convex/ai/usageControls";

const toInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

class InMemoryAiUsageLedgerRepository implements AiUsageLedgerRepository {
  private entries: AiUsageLedgerEntry[] = [];

  async insert(entry: Omit<AiUsageLedgerEntry, "id" | "createdAt">): Promise<string> {
    const id = `ledger_${this.entries.length + 1}`;
    this.entries.push({
      id,
      createdAt: Date.now(),
      ...entry,
    });
    return id;
  }
}

class InMemoryRateLimitRepository implements RateLimitRepository {
  private buckets = new Map<string, { count: number; expiresAt: number }>();

  async incrementAndGet(tenantId: string, key: string, windowMs: number): Promise<number> {
    const bucketKey = `${tenantId}:${key}`;
    const now = Date.now();
    const existing = this.buckets.get(bucketKey);

    if (!existing || existing.expiresAt <= now) {
      this.buckets.set(bucketKey, { count: 1, expiresAt: now + windowMs });
      return 1;
    }

    const nextCount = existing.count + 1;
    this.buckets.set(bucketKey, { ...existing, count: nextCount });
    return nextCount;
  }
}

class InMemoryActionCacheRepository implements ActionCacheRepository {
  private cache = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(tenantId: string, cacheKey: string): Promise<T | null> {
    const key = `${tenantId}:${cacheKey}`;
    const existing = this.cache.get(key);
    if (!existing) {
      return null;
    }

    if (existing.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return existing.value as T;
  }

  async set<T>(tenantId: string, cacheKey: string, value: T, ttlMs: number): Promise<void> {
    const key = `${tenantId}:${cacheKey}`;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }
}

const usageController = new UsageController(
  new InMemoryAiUsageLedgerRepository(),
  new InMemoryRateLimitRepository(),
  new InMemoryActionCacheRepository(),
  {
    maxRequestsPerWindow: toInt(process.env.AI_USAGE_DEFAULT_MAX_REQUESTS_PER_WINDOW, 15),
    rateLimitWindowMs: toInt(process.env.AI_USAGE_DEFAULT_RATE_LIMIT_WINDOW_MS, 60_000),
    cacheTtlMs: toInt(process.env.AI_USAGE_CACHE_TTL_MS, 30_000),
    tokenCostUsdPer1k: Number.parseFloat(process.env.AI_USAGE_TOKEN_COST_USD_PER_1K ?? "0.002"),
    operationLimits: {
      aiInspection: {
        maxRequestsPerWindow: toInt(process.env.AI_INSPECTION_MAX_REQUESTS_PER_WINDOW, 5),
        rateLimitWindowMs: toInt(process.env.AI_INSPECTION_RATE_LIMIT_WINDOW_MS, 60_000),
      },
    },
  },
);

const buildCacheKey = (payload: AssessmentSubmissionRequest): string =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");

export const submitInspection = async (
  payload: AssessmentSubmissionRequest,
  correlationId: string,
): Promise<AssessmentSubmissionResponse> => {
  const tenantId = payload.tenantSlug;

  return usageController.withCacheRateLimitAndBilling<AssessmentSubmissionResponse, AssessmentSubmissionRequest>({
    tenantId,
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
