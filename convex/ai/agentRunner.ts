import { buildMemoryNamespace } from "./agents/common";

export type AgentTool<Args = unknown, Result = unknown> = {
  name: string;
  description: string;
  execute: (args: Args, context: AgentRunContext) => Promise<Result>;
};

export interface TenantMemoryRecord {
  id: string;
  tenantId: string;
  namespace: string;
  key: string;
  content: unknown;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface AgentRunContext {
  runId: string;
  tenantId: string;
  now: number;
  tools: ToolRegistry;
  persistence: AgentPersistence;
  memory: TenantMemoryRecord[];
}

export interface AgentDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  namespace: string;
  execute: (input: TInput, context: AgentRunContext) => Promise<TOutput>;
  memoryLimit?: number;
}

export interface AgentPersistence {
  createRun(entry: {
    tenantId: string;
    agentName: string;
    runType: string;
    targetType?: string;
    targetId?: string;
    input: unknown;
    startedAt: number;
  }): Promise<string>;
  completeRun(runId: string, output: unknown, finishedAt: number): Promise<void>;
  failRun(runId: string, error: unknown, finishedAt: number): Promise<void>;
  getTenantMemory(tenantId: string, namespace: string, limit?: number): Promise<TenantMemoryRecord[]>;
  storeTenantMemory(record: {
    tenantId: string;
    namespace: string;
    key: string;
    value: unknown;
    metadata?: Record<string, unknown>;
    expiresAt?: number;
  }): Promise<string>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  async invoke<TArgs = unknown, TResult = unknown>(
    name: string,
    args: TArgs,
    context: AgentRunContext,
  ): Promise<TResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return (await tool.execute(args, context)) as TResult;
  }
}

export class AgentRunner {
  constructor(
    private readonly persistence: AgentPersistence,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  async run<TInput, TOutput>(
    tenantId: string,
    agent: AgentDefinition<TInput, TOutput>,
    input: TInput,
    config?: {
      runType?: string;
      targetType?: string;
      targetId?: string;
    },
  ): Promise<{ output: TOutput; memory: TenantMemoryRecord[]; runId: string }> {
    const startedAt = Date.now();
    const namespace = buildMemoryNamespace(tenantId, agent.namespace);
    const runEntry: {
      tenantId: string;
      agentName: string;
      runType: string;
      targetType?: string;
      targetId?: string;
      input: unknown;
      startedAt: number;
    } = {
      tenantId,
      agentName: agent.name,
      runType: config?.runType ?? "inspection_lifecycle",
      input,
      startedAt,
    };

    if (config?.targetType) {
      runEntry.targetType = config.targetType;
    }
    if (config?.targetId) {
      runEntry.targetId = config.targetId;
    }

    const runId = await this.persistence.createRun(runEntry);

    try {
      const memory = await this.persistence.getTenantMemory(tenantId, namespace, agent.memoryLimit ?? 10);
      const context: AgentRunContext = {
        runId,
        tenantId,
        now: startedAt,
        tools: this.toolRegistry,
        persistence: this.persistence,
        memory,
      };

      const output = await agent.execute(input, context);
      await this.persistence.completeRun(runId, output, Date.now());

      return { output, memory, runId };
    } catch (error) {
      await this.persistence.failRun(
        runId,
        error instanceof Error ? { message: error.message } : { message: "Unknown agent failure" },
        Date.now(),
      );
      throw error;
    }
  }

  async remember(
    tenantId: string,
    namespace: string,
    key: string,
    value: unknown,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    const record: {
      tenantId: string;
      namespace: string;
      key: string;
      value: unknown;
      metadata?: Record<string, unknown>;
    } = {
      tenantId,
      namespace: buildMemoryNamespace(tenantId, namespace),
      key,
      value,
    };

    if (metadata) {
      record.metadata = metadata;
    }

    return this.persistence.storeTenantMemory(record);
  }
}
