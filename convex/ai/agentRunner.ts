export type AgentTool<Args = unknown, Result = unknown> = {
  name: string;
  description: string;
  execute: (args: Args, context: AgentRunContext) => Promise<Result>;
};

export interface TenantMemoryRecord {
  id: string;
  tenantId: string;
  namespace: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface RunLogEntry {
  runId: string;
  tenantId: string;
  agentName: string;
  status: "started" | "completed" | "failed";
  input: unknown;
  output?: unknown;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export interface AgentPersistence {
  getTenantMemory(tenantId: string, namespace: string, limit?: number): Promise<TenantMemoryRecord[]>;
  storeTenantMemory(record: Omit<TenantMemoryRecord, "id" | "createdAt">): Promise<string>;
  persistRunLog(entry: RunLogEntry): Promise<void>;
}

export interface AgentRunContext {
  runId: string;
  tenantId: string;
  now: number;
  tools: ToolRegistry;
  persistence: AgentPersistence;
}

export interface AgentDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  namespace: string;
  execute: (input: TInput, context: AgentRunContext) => Promise<TOutput>;
  memoryLimit?: number;
}

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  list(): AgentTool[] {
    return [...this.tools.values()];
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
  ): Promise<{ output: TOutput; memory: TenantMemoryRecord[]; runId: string }> {
    const runId = crypto.randomUUID();
    const startedAt = Date.now();

    await this.persistence.persistRunLog({
      runId,
      tenantId,
      agentName: agent.name,
      status: "started",
      input,
      startedAt,
    });

    const context: AgentRunContext = {
      runId,
      tenantId,
      now: startedAt,
      tools: this.toolRegistry,
      persistence: this.persistence,
    };

    try {
      const memory = await this.persistence.getTenantMemory(
        tenantId,
        agent.namespace,
        agent.memoryLimit ?? 10,
      );

      const output = await agent.execute(
        {
          ...((input as object) ?? {}),
          memory,
        } as TInput,
        context,
      );

      await this.persistence.persistRunLog({
        runId,
        tenantId,
        agentName: agent.name,
        status: "completed",
        input,
        output,
        startedAt,
        completedAt: Date.now(),
      });

      return { output, memory, runId };
    } catch (error) {
      await this.persistence.persistRunLog({
        runId,
        tenantId,
        agentName: agent.name,
        status: "failed",
        input,
        error: error instanceof Error ? error.message : "Unknown agent failure",
        startedAt,
        completedAt: Date.now(),
      });
      throw error;
    }
  }

  async remember(
    tenantId: string,
    namespace: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    return this.persistence.storeTenantMemory({
      tenantId,
      namespace,
      content,
      metadata,
    });
  }
}
