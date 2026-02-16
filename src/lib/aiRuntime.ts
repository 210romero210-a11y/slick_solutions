import {
  AgentRunner,
  type AgentDefinition,
  type AgentPersistence,
  type RunLogEntry,
  type TenantMemoryRecord,
  ToolRegistry,
} from "../../convex/ai/agentRunner";
import { OllamaClient } from "../../convex/ai/ollamaClient";

import { z } from "zod";

const visionOutputSchema = z.object({
  summary: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  confidence: z.number().min(0).max(1),
  recommendedServices: z.array(z.string().min(2)).min(1),
});

type VisionOutput = z.infer<typeof visionOutputSchema>;

type VisionAgentInput = {
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

  return {
    summary:
      score > 0.75
        ? "Detected heavier cosmetic correction demand. Recommend premium exterior correction package."
        : "Detected light-to-moderate cosmetic detailing needs.",
    severity: score > 0.85 ? "critical" : score > 0.7 ? "high" : score > 0.5 ? "medium" : "low",
    confidence: Number(score.toFixed(2)),
    recommendedServices:
      score > 0.75
        ? ["Paint correction", "Ceramic coating", "Deep interior extraction"]
        : ["Exterior detail", "Interior detail"],
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
      "Return JSON ONLY with keys: summary, severity, confidence, recommendedServices.",
      "Severity must be one of: low, medium, high, critical.",
      "Confidence must be a number between 0 and 1.",
      `VIN: ${input.vin}`,
      `Customer notes: ${input.concernNotes ?? "none"}`,
    ].join("\n");

    const response = await client.vision({
      model: process.env.OLLAMA_VISION_MODEL ?? "llama3.2-vision",
      prompt,
      images: input.photoUrls,
      stream: false,
      options: { temperature: 0.1 },
    });

    const parsed = visionOutputSchema.safeParse(extractJsonObject(response.response));

    if (!parsed.success) {
      return heuristicVisionFallback(input);
    }

    return parsed.data;
  },
};

const runner = new AgentRunner(new InMemoryAgentPersistence(), new ToolRegistry());

export type VisionAssessmentResult = VisionOutput & {
  runId: string;
  analysisSource: "ollama" | "heuristic";
};

export async function runVisionAssessment(input: VisionAgentInput): Promise<VisionAssessmentResult> {
  const { output, runId } = await runner.run(input.tenantSlug, visionAssessmentAgent, input);

  await runner.remember(
    input.tenantSlug,
    visionAssessmentAgent.namespace,
    `VIN ${input.vin} severity=${output.severity} confidence=${output.confidence}`,
    { recommendedServices: output.recommendedServices },
  );

  const analysisSource: "ollama" | "heuristic" = process.env.OLLAMA_BASE_URL ? "ollama" : "heuristic";

  return {
    ...output,
    runId,
    analysisSource,
  };
}

export function getVisionRunLogs(): ReadonlyArray<RunLogEntry> {
  return runLogs;
}
