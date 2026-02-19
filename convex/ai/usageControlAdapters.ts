import type { ActionCacheRepository, AiUsageLedgerEntry, AiUsageLedgerRepository, RateLimitRepository } from "./usageControls";

type ConvexClient = {
  mutation: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  query: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};

export class ConvexAiUsageLedgerRepository implements AiUsageLedgerRepository {
  constructor(private readonly client: ConvexClient) {}

  async insert(entry: Omit<AiUsageLedgerEntry, "id">): Promise<string> {
    const ledgerId = await this.client.mutation("ai/repositories:insertAiUsageLedgerEntry", {
      tenantId: entry.tenantId,
      actorId: entry.actorId,
      model: entry.model,
      operation: entry.operation,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      totalTokens: entry.totalTokens,
      estimatedCostUsd: entry.estimatedCostUsd,
      cacheHit: entry.cacheHit,
      metadata: entry.metadata,
      now: entry.createdAt,
    });

    return `${ledgerId}`;
  }
}

export class ConvexRateLimitRepository implements RateLimitRepository {
  constructor(private readonly client: ConvexClient) {}

  async incrementAndGet(tenantId: string, key: string, windowMs: number, now: number): Promise<number> {
    const result = (await this.client.mutation("ai/repositories:incrementActionRateLimit", {
      tenantKey: tenantId,
      operation: key,
      windowMs,
      now,
    })) as { count: number };

    return result.count;
  }
}

export class ConvexActionCacheRepository implements ActionCacheRepository {
  constructor(private readonly client: ConvexClient) {}

  async get<T>(tenantId: string, cacheKey: string): Promise<T | null> {
    return (await this.client.mutation("ai/repositories:getActionCacheEntry", {
      tenantKey: tenantId,
      cacheKey,
      now: Date.now(),
    })) as T | null;
  }

  async set<T>(tenantId: string, cacheKey: string, value: T, ttlMs: number): Promise<void> {
    await this.client.mutation("ai/repositories:setActionCacheEntry", {
      tenantKey: tenantId,
      cacheKey,
      value,
      ttlMs,
      now: Date.now(),
    });
  }
}
