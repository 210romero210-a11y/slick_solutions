import {
  AgentRunner,
  type AgentDefinition,
  type AgentPersistence,
  type RunLogEntry,
  type TenantMemoryRecord,
  ToolRegistry,
} from "../../convex/ai/agentRunner";
import { OllamaClient } from "../../convex/ai/ollamaClient";
import { AISignalPayloadSchema, type AISignalPayload } from "@slick/contracts";

import { z } from "zod";

type ForbiddenMonetaryFields = {
  quoteCents?: never;
  priceCents?: never;
  totalCents?: never;
  unitPriceCents?: never;
  estimatedHours?: never;
  recommendedServices?: never;
};

const visionOutputSchema = AISignalPayloadSchema.extend({
  provider: z.enum(["ollama", "heuristic"]),
  model: z.string().min(1),
  fallbackUsed: z.boolean(),
});

type VisionOutput = z.infer<typeof visionOutputSchema> & ForbiddenMonetaryFields;

export type VisionAgentInput = {
  tenantSlug: string;
  vin: string;
  concernNotes?: string;
  photoUrls: string[];
  memory?: TenantMemoryRecord[];
};

const tenantMemories: TenantMemoryRecord[] = [];
const runLogs: RunLogEntry[] = [];

class InMemoryAgentPersistence implements AgentPersistence {
  async getTenantMemory(tenantId: string, namespace: string, limit = 10): Promise<TenantMemoryRecord[]> {
    return tenantMemories
      .filter((record) => record.tenantId === tenantId && record.namespace === namespace)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async storeTenantMemory(record: Omit<TenantMemoryRecord, "id" | "createdAt">): Promise<string> {
    const stored: TenantMemoryRecord = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      ...record,
    };

    tenantMemories.push(stored);
    return stored.id;
  }

  async persistRunLog(entry: RunLogEntry): Promise<void> {
    runLogs.push(entry);
  }
}

function heuristicVisionFallback(input: VisionAgentInput): VisionOutput {
  const detailHint = input.concernNotes?.toLowerCase().includes("scratch") ?? false;
  const score = Math.min(1, 0.4 + input.photoUrls.length * 0.08 + (detailHint ? 0.2 : 0));
  const severityBucket = score > 0.85 ? "critical" : score > 0.7 ? "high" : score > 0.5 ? "medium" : "low";

  return {
    summary:
      score > 0.75
        ? "Detected heavier cosmetic correction demand with broad exterior panel impact."
        : "Detected light-to-moderate cosmetic detailing needs.",
    severityBucket,
    confidence: Number(score.toFixed(2)),
    contaminationLevel: score > 0.82 ? "heavy" : score > 0.64 ? "moderate" : score > 0.5 ? "light" : "none",
    damageClass: score > 0.7 ? "mixed" : "cosmetic",
    damageType: detailHint ? "scratch" : score > 0.68 ? "swirl" : "unknown",
    panelMetrics: {
      totalPanelsObserved: Math.min(8, input.photoUrls.length),
      affectedPanels: score > 0.75 ? 4 : score > 0.6 ? 3 : 2,
      detailPhotos: Math.max(0, input.photoUrls.length - 4),
    },
    provider: "heuristic",
    model: "heuristic-fallback",
    fallbackUsed: true,
  };
}

function extractJsonObject(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Vision model did not return JSON payload");
  }

  return JSON.parse(raw.slice(start, end + 1));
}

const visionAssessmentAgent: AgentDefinition<VisionAgentInput, VisionOutput> = {
  name: "vision_assessment_agent",
  namespace: "vision_assessment",
  memoryLimit: 8,
  async execute(input): Promise<VisionOutput> {
    const baseUrl = process.env.OLLAMA_BASE_URL;
    const model = process.env.OLLAMA_VISION_MODEL ?? "llama3.2-vision";

    if (!baseUrl) {
      return heuristicVisionFallback(input);
    }

    const client = new OllamaClient({
      baseUrl,
      timeoutMs: 25_000,
      retries: 1,
    });

    const prompt = [
      "You are an auto-detailing condition analysis assistant.",
      "Return JSON ONLY with keys: summary, severityBucket, confidence, contaminationLevel, damageClass, damageType, panelMetrics.",
      "severityBucket must be one of: low, medium, high, critical.",
      "contaminationLevel must be one of: none, light, moderate, heavy.",
      "damageClass must be one of: cosmetic, interior, mixed, unknown.",
      "damageType must be one of: scratch, swirl, oxidation, stain, debris, unknown.",
      "panelMetrics must include totalPanelsObserved, affectedPanels, and detailPhotos (all integers >= 0).",
      "Confidence must be a number between 0 and 1.",
      `VIN: ${input.vin}`,
      `Customer notes: ${input.concernNotes ?? "none"}`,
    ].join("\n");

    try {
      const response = await client.vision({
        model,
        prompt,
        images: input.photoUrls,
        stream: false,
        options: { temperature: 0.1 },
      });

      const payload = extractJsonObject(response.response);
      const parsed = visionOutputSchema.safeParse({
        ...(typeof payload === "object" && payload !== null ? payload : {}),
        provider: "ollama",
        model,
        fallbackUsed: false,
      });

      if (!parsed.success) {
        return {
          ...heuristicVisionFallback(input),
          provider: "ollama",
          model,
          fallbackUsed: true,
        };
      }

      return parsed.data;
    } catch {
      return {
        ...heuristicVisionFallback(input),
        provider: "ollama",
        model,
        fallbackUsed: true,
      };
    }
  },
};

const runner = new AgentRunner(new InMemoryAgentPersistence(), new ToolRegistry());

export type VisionAssessmentResult = VisionOutput & {
  runId: string;
  analysisSource: "ollama" | "heuristic";
  signal: AISignalPayload;
};

export async function runVisionAssessment(input: VisionAgentInput): Promise<VisionAssessmentResult> {
  const { output, runId } = await runner.run(input.tenantSlug, visionAssessmentAgent, input);

  await runner.remember(
    input.tenantSlug,
    visionAssessmentAgent.namespace,
    `VIN ${input.vin} severity=${output.severityBucket} confidence=${output.confidence}`,
    {
      severityBucket: output.severityBucket,
      contaminationLevel: output.contaminationLevel,
      damageClass: output.damageClass,
      damageType: output.damageType,
      panelMetrics: output.panelMetrics,
    },
  );

  const analysisSource: "ollama" | "heuristic" = output.fallbackUsed ? "heuristic" : output.provider;

  return {
    ...output,
    runId,
    analysisSource,
    signal: AISignalPayloadSchema.parse({
      summary: output.summary,
      severityBucket: output.severityBucket,
      confidence: output.confidence,
      contaminationLevel: output.contaminationLevel,
      damageClass: output.damageClass,
      damageType: output.damageType,
      panelMetrics: output.panelMetrics,
    }),
  };
}

export function getVisionRunLogs(): ReadonlyArray<RunLogEntry> {
  return runLogs;
}
