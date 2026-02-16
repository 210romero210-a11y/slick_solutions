import { randomUUID } from "crypto";

export type PersistedAssessmentRun = {
  runId: string;
  inspectionId: string;
  tenantSlug: string;
  vin: string;
  model: string;
  source: "ollama" | "heuristic_fallback";
  severity: "minor" | "moderate" | "major" | "critical";
  confidence: number;
  summary: string;
  recommendedServices: string[];
  rawResponse?: string;
  needsManualReview: boolean;
  reviewStatus: "pending" | "approved" | "rejected";
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
};

export type CreateAssessmentRunInput = Omit<
  PersistedAssessmentRun,
  "runId" | "createdAt" | "reviewStatus" | "reviewedBy" | "reviewedAt" | "reviewNotes"
>;

export type ReviewAssessmentRunInput = {
  runId: string;
  reviewer: string;
  status: "approved" | "rejected";
  notes?: string;
};

const runs = new Map<string, PersistedAssessmentRun>();

export function createAssessmentRun(input: CreateAssessmentRunInput): PersistedAssessmentRun {
  const run: PersistedAssessmentRun = {
    ...input,
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    reviewStatus: "pending",
  };

  runs.set(run.runId, run);
  return run;
}

export function getAssessmentRun(runId: string): PersistedAssessmentRun | null {
  return runs.get(runId) ?? null;
}

export function reviewAssessmentRun(input: ReviewAssessmentRunInput): PersistedAssessmentRun | null {
  const current = runs.get(input.runId);

  if (!current) {
    return null;
  }

  const updated: PersistedAssessmentRun = {
    ...current,
    reviewStatus: input.status,
    reviewedBy: input.reviewer,
    reviewedAt: new Date().toISOString(),
    ...(input.notes ? { reviewNotes: input.notes } : {}),
  };

  runs.set(updated.runId, updated);
  return updated;
}
