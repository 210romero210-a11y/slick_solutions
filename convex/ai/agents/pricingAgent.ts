import type { AgentDefinition } from "../agentRunner";
import { validateAgentOutput, type PricingOutput } from "../schemas";

export type PricingAgentInput = {
  laborCents: number;
  materialsCents: number;
  taxRate: number;
};

export const pricingAgent: AgentDefinition<PricingAgentInput, PricingOutput> = {
  name: "pricingAgent",
  namespace: "pricing",
  memoryLimit: 5,
  execute: async (input, context) => {
    const totals = await context.tools.invoke<
      { laborCents: number; materialsCents: number; taxRate: number },
      { subtotal: number; taxes: number; total: number }
    >("pricing.calculate", input, context);

    const output: PricingOutput = {
      subtotal: totals.subtotal,
      taxes: totals.taxes,
      total: totals.total,
      lineItems: [
        {
          description: "Labor",
          quantity: 1,
          unitPrice: input.laborCents,
          total: input.laborCents,
        },
        {
          description: "Materials",
          quantity: 1,
          unitPrice: input.materialsCents,
          total: input.materialsCents,
        },
      ],
    };

    return validateAgentOutput("pricing", output);
  },
};
