import { ToolRegistry, type AgentRunContext } from "./agentRunner";

type PricingArgs = {
  laborCents: number;
  materialsCents: number;
  taxRate: number;
};

const invokeDeliveryChannel = async (
  args: { preferredChannel?: "email" | "sms" | "phone" | "in_app"; message: string },
  _context: AgentRunContext,
) => ({
  channel: args.preferredChannel ?? "email",
  accepted: true,
  messageId: `msg_${Date.now()}`,
  preview: args.message,
});

export const createDefaultToolRegistry = (): ToolRegistry => {
  const registry = new ToolRegistry();

  registry.register({
    name: "vin.retrieve",
    description: "Retrieve canonical vehicle profile from VIN.",
    execute: async (args: unknown) => {
      const payload = args as { vin: string };
      return {
        vin: payload.vin,
        decoded: {
          year: 2020,
          make: "Toyota",
          model: "Camry",
        },
      };
    },
  });

  registry.register({
    name: "vector.retrieve",
    description: "Return similar vector-backed records from tenant context.",
    execute: async (args: unknown, context) => {
      const payload = args as { query: string; limit?: number };
      const limit = Math.max(1, Math.min(10, payload.limit ?? 3));
      return Array.from({ length: limit }).map((_, index) => ({
        id: `${context.tenantId}_match_${index + 1}`,
        score: Number((0.92 - index * 0.1).toFixed(3)),
        snippet: `Match for ${payload.query}`,
      }));
    },
  });

  registry.register({
    name: "pricing.calculate",
    description: "Calculate pricing totals for inspection output.",
    execute: async (args: unknown) => {
      const payload = args as PricingArgs;
      const subtotal = payload.laborCents + payload.materialsCents;
      const taxes = Math.round(subtotal * payload.taxRate);
      return {
        subtotal,
        taxes,
        total: subtotal + taxes,
      };
    },
  });

  registry.register({
    name: "delivery.dispatch",
    description: "Dispatch customer communication payload to selected channel.",
    execute: async (args: unknown, context) => invokeDeliveryChannel(args as any, context),
  });

  return registry;
};
