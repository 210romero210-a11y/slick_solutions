export class ActionRateLimitExceededError extends Error {
  constructor(
    public readonly details: {
      operation: string;
      tenantKey: string;
      limit: number;
      windowMs: number;
      retryAfterMs: number;
      currentCount: number;
    },
  ) {
    super(`Rate limit exceeded for ${details.operation}`);
    this.name = "ActionRateLimitExceededError";
  }
}

export async function enforceActionRateLimit(
  ctx: any,
  args: {
    tenantKey: string;
    operation: string;
    maxRequestsPerWindow: number;
    windowMs: number;
  },
): Promise<void> {
  const now = Date.now();
  const result = await ctx.runMutation("rateLimits:incrementActionRateLimit", {
    tenantKey: args.tenantKey,
    operation: args.operation,
    windowMs: args.windowMs,
  });

  if (result.count > args.maxRequestsPerWindow) {
    const retryAfterMs = args.windowMs - (now % args.windowMs);
    throw new ActionRateLimitExceededError({
      operation: args.operation,
      tenantKey: args.tenantKey,
      limit: args.maxRequestsPerWindow,
      windowMs: args.windowMs,
      retryAfterMs,
      currentCount: result.count,
    });
  }
}
