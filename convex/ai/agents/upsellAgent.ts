import type { AgentDefinition } from "../agentRunner";
import { validateAgentOutput, type UpsellOutput } from "../schemas";

export type UpsellAgentInput = {
  summary: string;
  estimatedTotalCents: number;
};

export const upsellAgent: AgentDefinition<UpsellAgentInput, UpsellOutput> = {
  name: "upsellAgent",
  namespace: "upsell",
  memoryLimit: 5,
  execute: async (input, context) => {
    const catalogMatches = await context.tools.invoke<{ query: string; limit: number }, Array<{ snippet: string; score: number }>>(
      "vector.retrieve",
      { query: input.summary, limit: 2 },
      context,
    );

    const output: UpsellOutput = {
      opportunities: catalogMatches.map((match, index) => ({
        offer: `Upsell package ${index + 1}`,
        expectedValue: Math.round(input.estimatedTotalCents * (0.08 - index * 0.01)),
        rationale: `${match.snippet} (${match.score})`,
      })),
      priority: input.estimatedTotalCents >= 150_000 ? "high" : "medium",
    };

    return validateAgentOutput("upsell", output);
  },
};
