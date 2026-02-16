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
  insert(entry: Omit<AiUsageLedgerEntry, "id" | "createdAt">): Promise<string>;
}

export interface RateLimitRepository {
  incrementAndGet(tenantId: string, key: string, windowMs: number): Promise<number>;
}

export interface ActionCacheRepository {
  get<T>(tenantId: string, cacheKey: string): Promise<T | null>;
  set<T>(tenantId: string, cacheKey: string, value: T, ttlMs: number): Promise<void>;
}

export interface UsageControlOptions {
  maxRequestsPerWindow: number;
  rateLimitWindowMs: number;
  cacheTtlMs?: number;
  tokenCostUsdPer1k: number;
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

export class UsageController {
  private readonly cacheTtlMs: number;

  constructor(
    private readonly ledger: AiUsageLedgerRepository,
    private readonly rateLimiter: RateLimitRepository,
    private readonly cache: ActionCacheRepository,
    private readonly options: UsageControlOptions,
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60_000;
  }

  async withCacheRateLimitAndBilling<T>(input: MeteredExecutionInput<unknown>): Promise<T> {
    const rateLimitKey = `${input.operation}:${Math.floor(Date.now() / this.options.rateLimitWindowMs)}`;
    const count = await this.rateLimiter.incrementAndGet(
      input.tenantId,
      rateLimitKey,
      this.options.rateLimitWindowMs,
    );

    if (count > this.options.maxRequestsPerWindow) {
      throw new Error(`Rate limit exceeded for tenant ${input.tenantId}`);
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

  private async writeLedger(
    input: MeteredExecutionInput<unknown>,
    tokenUsage: { inputTokens: number; outputTokens: number; cacheHit: boolean },
  ): Promise<void> {
    const totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;
    const estimatedCostUsd = (totalTokens / 1000) * this.options.tokenCostUsdPer1k;

    await this.ledger.insert({
      tenantId: input.tenantId,
      actorId: input.actorId,
      model: input.model,
      operation: input.operation,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      totalTokens,
      estimatedCostUsd,
      cacheHit: tokenUsage.cacheHit,
      metadata: input.metadata,
    });
  }
}
