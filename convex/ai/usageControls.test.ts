import assert from "node:assert/strict";
import test from "node:test";

import {
  type ActionCacheRepository,
  type AiUsageLedgerEntry,
  type AiUsageLedgerRepository,
  type RateLimitRepository,
  RateLimitExceededError,
  UsageController,
} from "./usageControls.ts";

class TestLedger implements AiUsageLedgerRepository {
  public readonly entries: Array<Omit<AiUsageLedgerEntry, "id">> = [];

  async insert(entry: Omit<AiUsageLedgerEntry, "id">): Promise<string> {
    this.entries.push(entry);
    return `ledger_${this.entries.length}`;
  }
}

class TestRateLimiter implements RateLimitRepository {
  private readonly buckets = new Map<string, number>();

  async incrementAndGet(tenantId: string, key: string, windowMs: number, now: number): Promise<number> {
    const windowStart = now - (now % windowMs);
    const bucketKey = `${tenantId}:${key}:${windowStart}`;
    const next = (this.buckets.get(bucketKey) ?? 0) + 1;
    this.buckets.set(bucketKey, next);
    return next;
  }
}

class TestCache implements ActionCacheRepository {
  private readonly store = new Map<string, unknown>();

  async get<T>(tenantId: string, cacheKey: string): Promise<T | null> {
    const key = `${tenantId}:${cacheKey}`;
    return (this.store.get(key) as T | undefined) ?? null;
  }

  async set<T>(tenantId: string, cacheKey: string, value: T, _ttlMs: number): Promise<void> {
    const key = `${tenantId}:${cacheKey}`;
    this.store.set(key, value);
  }
}

test("throws RateLimitExceededError and records rejected attempts for abuse analytics", async () => {
  const ledger = new TestLedger();
  const controller = new UsageController(ledger, new TestRateLimiter(), new TestCache(), {
    maxRequestsPerWindow: 1,
    rateLimitWindowMs: 60_000,
    tokenCostUsdPer1k: 0.002,
    now: () => 30_000,
  });

  const input = {
    tenantId: "tenant-1",
    model: "inspection-orchestrator",
    operation: "aiInspection",
    cacheKey: "cache-key",
    args: { payload: "one" },
    estimateInputTokens: () => 20,
    estimateOutputTokens: () => 30,
    execute: async () => ({ ok: true }),
    metadata: { correlationId: "corr_1" },
  };

  await controller.withCacheRateLimitAndBilling(input);

  await assert.rejects(
    controller.withCacheRateLimitAndBilling(input),
    (error: unknown) => {
      assert.ok(error instanceof RateLimitExceededError);
      assert.equal(error.details.operation, "aiInspection");
      assert.equal(error.details.retryAfterMs, 30_000);
      return true;
    },
  );

  assert.equal(ledger.entries.length, 2);
  assert.equal(ledger.entries[1]?.metadata?.rejected, true);
  assert.equal(ledger.entries[1]?.metadata?.reason, "rate_limit_exceeded");
});

test("uses cache for retries and tracks cache-hit billing semantics", async () => {
  const ledger = new TestLedger();
  let executions = 0;
  const controller = new UsageController(ledger, new TestRateLimiter(), new TestCache(), {
    maxRequestsPerWindow: 5,
    rateLimitWindowMs: 60_000,
    tokenCostUsdPer1k: 0.002,
    now: () => 10_000,
  });

  const input = {
    tenantId: "tenant-2",
    model: "inspection-orchestrator",
    operation: "aiInspection",
    cacheKey: "same-request",
    args: { payload: "retry" },
    estimateInputTokens: () => 16,
    estimateOutputTokens: () => 8,
    execute: async () => {
      executions += 1;
      return { inspectionId: "insp_1" };
    },
  };

  await controller.withCacheRateLimitAndBilling(input);
  await controller.withCacheRateLimitAndBilling(input);

  assert.equal(executions, 1);
  assert.equal(ledger.entries.length, 2);
  assert.equal(ledger.entries[0]?.cacheHit, false);
  assert.equal(ledger.entries[1]?.cacheHit, true);
  assert.equal(ledger.entries[1]?.outputTokens, 0);
});

test("applies tenant and operation specific limits across rolling windows", async () => {
  const ledger = new TestLedger();
  let currentTime = 0;
  const controller = new UsageController(ledger, new TestRateLimiter(), new TestCache(), {
    maxRequestsPerWindow: 10,
    rateLimitWindowMs: 60_000,
    tokenCostUsdPer1k: 0.002,
    now: () => currentTime,
    tenantOperationLimits: {
      "tenant-special": {
        aiInspection: {
          maxRequestsPerWindow: 1,
          rateLimitWindowMs: 1_000,
        },
      },
    },
  });

  const input = {
    tenantId: "tenant-special",
    model: "inspection-orchestrator",
    operation: "aiInspection",
    cacheKey: "windowed",
    args: { payload: "window" },
    estimateInputTokens: () => 10,
    estimateOutputTokens: () => 4,
    execute: async () => ({ ok: true }),
  };

  await controller.withCacheRateLimitAndBilling(input);
  await assert.rejects(controller.withCacheRateLimitAndBilling(input), RateLimitExceededError);

  currentTime = 1_200;
  await controller.withCacheRateLimitAndBilling({ ...input, cacheKey: "windowed-2" });

  assert.equal(ledger.entries.length, 3);
});


class CapturingRateLimiter implements RateLimitRepository {
  public lastKey: string | null = null;

  async incrementAndGet(_tenantId: string, key: string, _windowMs: number): Promise<number> {
    this.lastKey = key;
    return 1;
  }
}

test("uses tenant and feature in rate-limit bucket keys", async () => {
  const ledger = new TestLedger();
  const rateLimiter = new CapturingRateLimiter();
  const controller = new UsageController(ledger, rateLimiter, new TestCache(), {
    maxRequestsPerWindow: 3,
    rateLimitWindowMs: 60_000,
    tokenCostUsdPer1k: 0.002,
    now: () => 125_000,
  });

  await controller.withCacheRateLimitAndBilling({
    tenantId: "tenant-keyed",
    model: "inspection-orchestrator",
    operation: "aiInspection",
    cacheKey: "one",
    args: { payload: "x" },
    estimateInputTokens: () => 4,
    estimateOutputTokens: () => 2,
    execute: async () => ({ ok: true }),
  });

  assert.equal(rateLimiter.lastKey, "tenant-keyed:aiInspection:2");
});

test("records consistent ledger totals and costs across repeated calls", async () => {
  const ledger = new TestLedger();
  let executions = 0;
  const controller = new UsageController(ledger, new TestRateLimiter(), new TestCache(), {
    maxRequestsPerWindow: 5,
    rateLimitWindowMs: 60_000,
    tokenCostUsdPer1k: 0.5,
    now: () => 1_000,
  });

  const input = {
    tenantId: "tenant-ledger",
    model: "inspection-orchestrator",
    operation: "aiInspection",
    cacheKey: "repeat",
    args: { payload: "repeat" },
    estimateInputTokens: () => 100,
    estimateOutputTokens: () => 50,
    execute: async () => {
      executions += 1;
      return { ok: true };
    },
  };

  await controller.withCacheRateLimitAndBilling(input);
  await controller.withCacheRateLimitAndBilling(input);
  await controller.withCacheRateLimitAndBilling(input);

  assert.equal(executions, 1);
  assert.equal(ledger.entries.length, 3);
  assert.deepEqual(ledger.entries.map((entry) => entry.totalTokens), [150, 100, 100]);
  assert.deepEqual(ledger.entries.map((entry) => entry.estimatedCostUsd), [0.075, 0.05, 0.05]);
  assert.deepEqual(ledger.entries.map((entry) => entry.cacheHit), [false, true, true]);
});
