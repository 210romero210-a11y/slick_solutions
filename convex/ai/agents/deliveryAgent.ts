import type { AgentDefinition } from "../agentRunner";
import { validateAgentOutput, type CustomerCommunicationOutput } from "../schemas";

export type DeliveryAgentInput = {
  customerName: string;
  priceTotalCents: number;
  channel?: "email" | "sms" | "phone" | "in_app";
};

export const deliveryAgent: AgentDefinition<DeliveryAgentInput, CustomerCommunicationOutput> = {
  name: "deliveryAgent",
  namespace: "delivery",
  memoryLimit: 3,
  execute: async (input, context) => {
    const message = `Hi ${input.customerName}, your estimate is $${(input.priceTotalCents / 100).toFixed(2)}.`;
    const deliveryArgs: { preferredChannel?: "email" | "sms" | "phone" | "in_app"; message: string } = { message };
    if (input.channel) {
      deliveryArgs.preferredChannel = input.channel;
    }

    const delivery = await context.tools.invoke<
      { preferredChannel?: "email" | "sms" | "phone" | "in_app"; message: string },
      { channel: "email" | "sms" | "phone" | "in_app"; accepted: boolean; preview: string }
    >("delivery.dispatch", deliveryArgs, context);

    return validateAgentOutput("customerCommunication", {
      channel: delivery.channel,
      message: delivery.preview,
      tone: "friendly",
    });
  },
};
