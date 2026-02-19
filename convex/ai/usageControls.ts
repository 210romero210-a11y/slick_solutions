export interface AiUsageLedgerEntry {
  id: string;
  tenantId: string;
  actorId?: string;
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  cacheHit: boolean;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface AiUsageLedgerRepository {
  insert(entry: Omit<AiUsageLedgerEntry, "id">): Promise<string>;
}

export interface RateLimitRepository {
  incrementAndGet(tenantId: string, key: string, windowMs: number, now: number): Promise<number>;
}

export interface ActionCacheRepository {
  get<T>(tenantId: string, cacheKey: string): Promise<T | null>;
  set<T>(tenantId: string, cacheKey: string, value: T, ttlMs: number): Promise<void>;
}

export type RateLimitPolicy = {
  maxRequestsPerWindow: number;
  rateLimitWindowMs: number;
};

export interface UsageControlOptions extends RateLimitPolicy {
  cacheTtlMs?: number;
  tokenCostUsdPer1k: number;
  operationLimits?: Record<string, RateLimitPolicy>;
  tenantOperationLimits?: Record<string, Record<string, RateLimitPolicy>>;
  now?: () => number;
}

export interface MeteredExecutionInput<TArgs> {
  tenantId: string;
  actorId?: string;
  model: string;
  operation: string;
  cacheKey: string;
  args: TArgs;
  estimateInputTokens: (args: TArgs) => number;
  estimateOutputTokens: (result: unknown) => number;
  execute: () => Promise<unknown>;
  metadata?: Record<string, unknown>;
}

export class RateLimitExceededError extends Error {
  public readonly details: {
    tenantId: string;
    operation: string;
    maxRequestsPerWindow: number;
    rateLimitWindowMs: number;
    currentCount: number;
    retryAfterMs: number;
    correlationId?: string;
  };

  constructor(
    details: {
      tenantId: string;
      operation: string;
      maxRequestsPerWindow: number;
      rateLimitWindowMs: number;
      currentCount: number;
      retryAfterMs: number;
      correlationId?: string;
    },
  ) {
    super(`Rate limit exceeded for tenant ${details.tenantId} and operation ${details.operation}`);
    this.name = "RateLimitExceededError";
    this.details = details;
  }
}

export class UsageController {
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly ledger: AiUsageLedgerRepository;
  private readonly rateLimiter: RateLimitRepository;
  private readonly cache: ActionCacheRepository;
  private readonly options: UsageControlOptions;

  constructor(
    ledger: AiUsageLedgerRepository,
    rateLimiter: RateLimitRepository,
    cache: ActionCacheRepository,
    options: UsageControlOptions,
  ) {
    this.ledger = ledger;
    this.rateLimiter = rateLimiter;
    this.cache = cache;
    this.options = options;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60_000;
    this.now = options.now ?? Date.now;
  }

  async withCacheRateLimitAndBilling<T, TArgs>(input: MeteredExecutionInput<TArgs>): Promise<T> {
    const policy = this.resolvePolicy(input.tenantId, input.operation);
    const now = this.now();
    const windowBucket = Math.floor(now / policy.rateLimitWindowMs);
    const rateLimitKey = `${input.tenantId}:${input.operation}:${windowBucket}`;
    const count = await this.rateLimiter.incrementAndGet(
      input.tenantId,
      rateLimitKey,
      policy.rateLimitWindowMs,
    );

    if (count > policy.maxRequestsPerWindow) {
      const retryAfterMs = policy.rateLimitWindowMs - (now % policy.rateLimitWindowMs);
      await this.writeLedger(input, {
        inputTokens: input.estimateInputTokens(input.args),
        outputTokens: 0,
        cacheHit: false,
        metadata: {
          ...input.metadata,
          rejected: true,
          reason: "rate_limit_exceeded",
          currentCount: count,
          maxRequestsPerWindow: policy.maxRequestsPerWindow,
          rateLimitWindowMs: policy.rateLimitWindowMs,
          retryAfterMs,
        },
      });

      throw new RateLimitExceededError({
        tenantId: input.tenantId,
        operation: input.operation,
        currentCount: count,
        maxRequestsPerWindow: policy.maxRequestsPerWindow,
        rateLimitWindowMs: policy.rateLimitWindowMs,
        retryAfterMs,
        ...(typeof input.metadata?.correlationId === "string"
          ? { correlationId: input.metadata.correlationId }
          : {}),
      });
    }

    const cached = await this.cache.get<T>(input.tenantId, input.cacheKey);
    if (cached !== null) {
      await this.writeLedger(input, {
        inputTokens: input.estimateInputTokens(input.args),
        outputTokens: 0,
        cacheHit: true,
      });
      return cached;
    }

    const result = (await input.execute()) as T;
    await this.cache.set(input.tenantId, input.cacheKey, result, this.cacheTtlMs);

    await this.writeLedger(input, {
      inputTokens: input.estimateInputTokens(input.args),
      outputTokens: input.estimateOutputTokens(result),
      cacheHit: false,
    });

    return result;
  }

  private resolvePolicy(tenantId: string, operation: string): RateLimitPolicy {
    const tenantPolicy = this.options.tenantOperationLimits?.[tenantId]?.[operation];
    if (tenantPolicy) {
      return tenantPolicy;
    }

    const operationPolicy = this.options.operationLimits?.[operation];
    if (operationPolicy) {
      return operationPolicy;
    }

    return {
      maxRequestsPerWindow: this.options.maxRequestsPerWindow,
      rateLimitWindowMs: this.options.rateLimitWindowMs,
    };
  }

  private async writeLedger<TArgs>(
    input: MeteredExecutionInput<TArgs>,
    tokenUsage: {
      inputTokens: number;
      outputTokens: number;
      cacheHit: boolean;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;
    const estimatedCostUsd = (totalTokens / 1000) * this.options.tokenCostUsdPer1k;

    await this.ledger.insert({
      tenantId: input.tenantId,
      ...(input.actorId ? { actorId: input.actorId } : {}),
      model: input.model,
      operation: input.operation,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      totalTokens,
      estimatedCostUsd,
      cacheHit: tokenUsage.cacheHit,
      createdAt: this.now(),
      metadata: {
        ...input.metadata,
        ...tokenUsage.metadata,
      },
    });
  }
}
