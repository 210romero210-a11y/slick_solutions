import type { AgentPersistence, TenantMemoryRecord } from "./agentRunner";

type ActionCtx = {
  runQuery: (name: string, args: Record<string, unknown>) => Promise<any>;
  runMutation: (name: string, args: Record<string, unknown>) => Promise<any>;
};

export class ConvexAgentPersistenceAdapter implements AgentPersistence {
  constructor(private readonly ctx: ActionCtx) {}

  async createRun(entry: {
    tenantId: string;
    agentName: string;
    runType: string;
    targetType?: string;
    targetId?: string;
    input: unknown;
    startedAt: number;
  }): Promise<string> {
    const runId = await this.ctx.runMutation("ai/repositories:createAgentRun", {
      tenantId: entry.tenantId,
      agentName: entry.agentName,
      runType: entry.runType,
      targetType: entry.targetType,
      targetId: entry.targetId,
      input: entry.input,
      startedAt: entry.startedAt,
    });

    return `${runId}`;
  }

  async completeRun(runId: string, output: unknown, finishedAt: number): Promise<void> {
    await this.ctx.runMutation("ai/repositories:completeAgentRun", {
      runId: runId,
      output,
      finishedAt,
    });
  }

  async failRun(runId: string, error: unknown, finishedAt: number): Promise<void> {
    await this.ctx.runMutation("ai/repositories:failAgentRun", {
      runId: runId,
      error,
      finishedAt,
    });
  }

  async getTenantMemory(tenantId: string, namespace: string, limit?: number): Promise<TenantMemoryRecord[]> {
    return this.ctx.runQuery("ai/repositories:listAgentMemory", {
      tenantId: tenantId,
      namespace,
      limit,
    });
  }

  async storeTenantMemory(record: {
    tenantId: string;
    namespace: string;
    key: string;
    value: unknown;
    metadata?: Record<string, unknown>;
    expiresAt?: number;
  }): Promise<string> {
    const memoryId = await this.ctx.runMutation("ai/repositories:putAgentMemory", {
      tenantId: record.tenantId,
      namespace: record.namespace,
      key: record.key,
      value: record.value,
      metadata: record.metadata,
      expiresAt: record.expiresAt,
      now: Date.now(),
    });

    return `${memoryId}`;
  }
}
