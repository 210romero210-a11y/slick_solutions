import type { AgentRunContext } from "../agentRunner";

export const buildMemoryNamespace = (tenantId: string, namespace: string): string => `${tenantId}:${namespace}`;

export const readMemoryHighlights = (context: AgentRunContext): string[] =>
  context.memory.slice(0, 3).map((entry) => String(entry.content));
