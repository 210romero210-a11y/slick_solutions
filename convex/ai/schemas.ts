export type StructuredOutputSchema = {
  type: "object";
  additionalProperties: boolean;
  required: string[];
  properties: Record<string, unknown>;
};

export interface InspectionOutput {
  summary: string;
  checklist: Array<{ item: string; status: "pass" | "fail" | "unknown"; notes?: string }>;
  recommendedActions: string[];
}

export interface VisionOutput {
  sceneDescription: string;
  detectedObjects: Array<{ label: string; confidence: number; bbox?: [number, number, number, number] }>;
  anomalies: string[];
}

export interface DamageClassificationOutput {
  severity: "minor" | "moderate" | "major" | "critical";
  categories: string[];
  confidence: number;
  rationale: string;
}

export interface PricingOutput {
  subtotal: number;
  taxes: number;
  total: number;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
}

export interface UpsellOutput {
  opportunities: Array<{ offer: string; expectedValue: number; rationale: string }>;
  priority: "low" | "medium" | "high";
}

export interface QaOutput {
  pass: boolean;
  findings: Array<{ check: string; pass: boolean; details?: string }>;
  escalationRequired: boolean;
}

export interface CustomerCommunicationOutput {
  channel: "email" | "sms" | "phone" | "in_app";
  message: string;
  tone: "friendly" | "neutral" | "formal";
}

export interface TechnicianRoutingOutput {
  technicianId: string;
  etaMinutes: number;
  reason: string;
  alternatives: string[];
}

export interface RevenueOptimizationOutput {
  strategy: string;
  projectedLiftPercent: number;
  actions: string[];
}

export const inspectionSchema: StructuredOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "checklist", "recommendedActions"],
  properties: {
    summary: { type: "string" },
    checklist: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item", "status"],
        properties: {
          item: { type: "string" },
          status: { enum: ["pass", "fail", "unknown"] },
          notes: { type: "string" },
        },
      },
    },
    recommendedActions: { type: "array", items: { type: "string" } },
  },
};

export const visionSchema: StructuredOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sceneDescription", "detectedObjects", "anomalies"],
  properties: {
    sceneDescription: { type: "string" },
    detectedObjects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "confidence"],
        properties: {
          label: { type: "string" },
          confidence: { type: "number" },
          bbox: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: { type: "number" },
          },
        },
      },
    },
    anomalies: { type: "array", items: { type: "string" } },
  },
};

export const damageClassificationSchema: StructuredOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["severity", "categories", "confidence", "rationale"],
  properties: {
    severity: { enum: ["minor", "moderate", "major", "critical"] },
    categories: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
    rationale: { type: "string" },
  },
};

export const pricingSchema: StructuredOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["subtotal", "taxes", "total", "lineItems"],
  properties: {
    subtotal: { type: "number" },
    taxes: { type: "number" },
    total: { type: "number" },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "quantity", "unitPrice", "total"],
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
          total: { type: "number" },
        },
      },
    },
  },
};

export const upsellSchema: StructuredOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["opportunities", "priority"],
  properties: {
    opportunities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["offer", "expectedValue", "rationale"],
        properties: {
          offer: { type: "string" },
          expectedValue: { type: "number" },
          rationale: { type: "string" },
        },
      },
    },
    priority: { enum: ["low", "medium", "high"] },
  },
};

export const qaSchema: StructuredOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["pass", "findings", "escalationRequired"],
  properties: {
    pass: { type: "boolean" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["check", "pass"],
        properties: {
          check: { type: "string" },
          pass: { type: "boolean" },
          details: { type: "string" },
        },
      },
    },
    escalationRequired: { type: "boolean" },
  },
};

export const customerCommunicationSchema: StructuredOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["channel", "message", "tone"],
  properties: {
    channel: { enum: ["email", "sms", "phone", "in_app"] },
    message: { type: "string" },
    tone: { enum: ["friendly", "neutral", "formal"] },
  },
};

export const technicianRoutingSchema: StructuredOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["technicianId", "etaMinutes", "reason", "alternatives"],
  properties: {
    technicianId: { type: "string" },
    etaMinutes: { type: "number" },
    reason: { type: "string" },
    alternatives: { type: "array", items: { type: "string" } },
  },
};

export const revenueOptimizationSchema: StructuredOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["strategy", "projectedLiftPercent", "actions"],
  properties: {
    strategy: { type: "string" },
    projectedLiftPercent: { type: "number" },
    actions: { type: "array", items: { type: "string" } },
  },
};

export const agentOutputSchemas = {
  inspection: inspectionSchema,
  vision: visionSchema,
  damageClassification: damageClassificationSchema,
  pricing: pricingSchema,
  upsell: upsellSchema,
  qa: qaSchema,
  customerCommunication: customerCommunicationSchema,
  technicianRouting: technicianRoutingSchema,
  revenueOptimization: revenueOptimizationSchema,
} as const;

export type AgentOutputSchemaName = keyof typeof agentOutputSchemas;

type SchemaOutputMap = {
  inspection: InspectionOutput;
  vision: VisionOutput;
  damageClassification: DamageClassificationOutput;
  pricing: PricingOutput;
  upsell: UpsellOutput;
  qa: QaOutput;
  customerCommunication: CustomerCommunicationOutput;
  technicianRouting: TechnicianRoutingOutput;
  revenueOptimization: RevenueOptimizationOutput;
};

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(`Schema validation failed: ${message}`);
  }
};

export const validateAgentOutput = <TName extends AgentOutputSchemaName>(
  schemaName: TName,
  payload: SchemaOutputMap[TName],
): SchemaOutputMap[TName] => {
  if (schemaName === "inspection") {
    const record = payload as InspectionOutput;
    assert(typeof record.summary === "string", "inspection.summary");
    assert(Array.isArray(record.checklist), "inspection.checklist");
    assert(Array.isArray(record.recommendedActions), "inspection.recommendedActions");
  }

  if (schemaName === "pricing") {
    const record = payload as PricingOutput;
    assert(typeof record.subtotal === "number", "pricing.subtotal");
    assert(typeof record.taxes === "number", "pricing.taxes");
    assert(typeof record.total === "number", "pricing.total");
    assert(Array.isArray(record.lineItems), "pricing.lineItems");
  }

  if (schemaName === "upsell") {
    const record = payload as UpsellOutput;
    assert(Array.isArray(record.opportunities), "upsell.opportunities");
    assert(["low", "medium", "high"].includes(record.priority), "upsell.priority");
  }

  if (schemaName === "customerCommunication") {
    const record = payload as CustomerCommunicationOutput;
    assert(["email", "sms", "phone", "in_app"].includes(record.channel), "customerCommunication.channel");
    assert(typeof record.message === "string", "customerCommunication.message");
  }

  return payload;
};
