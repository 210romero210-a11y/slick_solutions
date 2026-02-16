import { z } from "zod";

import { OllamaClient } from "../../convex/ai/ollamaClient";

const severitySchema = z.enum(["minor", "moderate", "major", "critical"]);

const visionFindingSchema = z.object({
  severity: severitySchema,
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
  recommendedServices: z.array(z.string().min(1)).default([]),
});

export type VisionFinding = z.infer<typeof visionFindingSchema>;

export type VisionAssessmentInput = {
  vin: string;
  photoUrls: string[];
  concernNotes?: string;
};

export type VisionAssessmentResult = {
  finding: VisionFinding;
  source: "ollama" | "heuristic_fallback";
  model: string;
  rawResponse?: string;
};

const severityToDifficulty: Record<z.infer<typeof severitySchema>, number> = {
  minor: 25,
  moderate: 50,
  major: 75,
  critical: 90,
};

function parsePotentialJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return JSON.parse(fencedMatch[1]);
  }
  return JSON.parse(trimmed);
}

function fallbackFinding(photoCount: number, concernNotes?: string): VisionFinding {
  const normalizedNotes = concernNotes?.toLowerCase() ?? "";
  const mentionsDeepIssue = ["scratch", "oxidation", "stain", "odor", "pet hair", "deep"].some((keyword) =>
    normalizedNotes.includes(keyword),
  );

  if (photoCount >= 6 || mentionsDeepIssue) {
    return {
      severity: "major",
      confidence: 0.62,
      summary: "Fallback classification indicates substantial correction effort based on media count and concern notes.",
      recommendedServices: ["Paint correction", "Interior deep clean"],
    };
  }

  if (photoCount >= 3) {
    return {
      severity: "moderate",
      confidence: 0.57,
      summary: "Fallback classification indicates moderate correction for common exterior/interior defects.",
      recommendedServices: ["Exterior detail", "Interior detail"],
    };
  }

  return {
    severity: "minor",
    confidence: 0.52,
    summary: "Fallback classification indicates minor detailing needs from limited media evidence.",
    recommendedServices: ["Maintenance wash"],
  };
}

function createPrompt(input: VisionAssessmentInput): string {
  return [
    "You are an automotive detailing assessment assistant.",
    "Analyze the vehicle condition from the provided images and notes.",
    "Return ONLY JSON with keys: severity, confidence, summary, recommendedServices.",
    "severity must be one of: minor, moderate, major, critical.",
    `VIN: ${input.vin}`,
    `Customer notes: ${input.concernNotes ?? "none"}`,
  ].join("\n");
}

export async function assessVehicleWithVision(input: VisionAssessmentInput): Promise<VisionAssessmentResult> {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  const model = process.env.OLLAMA_VISION_MODEL ?? "llama3.2-vision";

  if (!baseUrl) {
    return {
      finding: fallbackFinding(input.photoUrls.length, input.concernNotes),
      source: "heuristic_fallback",
      model,
    };
  }

  const client = new OllamaClient({
    baseUrl,
    timeoutMs: 20_000,
    retries: 1,
  });

  try {
    const response = await client.vision({
      model,
      prompt: createPrompt(input),
      images: input.photoUrls,
      stream: false,
    });

    const parsed = visionFindingSchema.parse(parsePotentialJson(response.response));

    return {
      finding: parsed,
      source: "ollama",
      model,
      rawResponse: response.response,
    };
  } catch {
    return {
      finding: fallbackFinding(input.photoUrls.length, input.concernNotes),
      source: "heuristic_fallback",
      model,
    };
  }
}

export function mapSeverityToDifficulty(severity: VisionFinding["severity"]): number {
  return severityToDifficulty[severity];
}
