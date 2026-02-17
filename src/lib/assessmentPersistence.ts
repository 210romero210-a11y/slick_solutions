import { randomUUID } from "crypto";

import { ConvexHttpClient } from "convex/browser";

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

const legacyRuns = new Map<string, PersistedAssessmentRun>();

function getConvexUrl(): string | null {
  return process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL ?? null;
}

function getClient(): ConvexHttpClient | null {
  const convexUrl = getConvexUrl();
  if (!convexUrl) {
    return null;
  }

  return new ConvexHttpClient(convexUrl);
}

function fromConvexRun(run: {
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
  reviewedAt?: number;
  reviewNotes?: string;
  createdAt: number;
}): PersistedAssessmentRun {
  return {
    runId: run.runId,
    inspectionId: run.inspectionId,
    tenantSlug: run.tenantSlug,
    vin: run.vin,
    model: run.model,
    source: run.source,
    severity: run.severity,
    confidence: run.confidence,
    summary: run.summary,
    recommendedServices: run.recommendedServices,
    ...(run.rawResponse ? { rawResponse: run.rawResponse } : {}),
    needsManualReview: run.needsManualReview,
    reviewStatus: run.reviewStatus,
    ...(run.reviewedBy ? { reviewedBy: run.reviewedBy } : {}),
    ...(run.reviewedAt ? { reviewedAt: new Date(run.reviewedAt).toISOString() } : {}),
    ...(run.reviewNotes ? { reviewNotes: run.reviewNotes } : {}),
    createdAt: new Date(run.createdAt).toISOString(),
  };
}

async function migrateLegacyRun(run: PersistedAssessmentRun): Promise<void> {
  const client = getClient();
  if (!client) {
    return;
  }

  await (client as any).action("assessmentRuns:createAssessmentRunAction", {
    run: {
      runId: run.runId,
      inspectionId: run.inspectionId,
      tenantSlug: run.tenantSlug,
      vin: run.vin,
      model: run.model,
      source: run.source,
      severity: run.severity,
      confidence: run.confidence,
      summary: run.summary,
      recommendedServices: run.recommendedServices,
      rawResponse: run.rawResponse,
      needsManualReview: run.needsManualReview,
      reviewStatus: run.reviewStatus,
      reviewedBy: run.reviewedBy,
      reviewedAt: run.reviewedAt ? Date.parse(run.reviewedAt) : undefined,
      reviewNotes: run.reviewNotes,
      createdAt: Date.parse(run.createdAt),
    },
  });
}

export async function createAssessmentRun(input: CreateAssessmentRunInput): Promise<PersistedAssessmentRun> {
  const run: PersistedAssessmentRun = {
    ...input,
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    reviewStatus: "pending",
  };

  legacyRuns.set(run.runId, run);

  const client = getClient();
  if (!client) {
    return run;
  }

  const saved = await (client as any).action("assessmentRuns:createAssessmentRunAction", {
    run: {
      runId: run.runId,
      inspectionId: run.inspectionId,
      tenantSlug: run.tenantSlug,
      vin: run.vin,
      model: run.model,
      source: run.source,
      severity: run.severity,
      confidence: run.confidence,
      summary: run.summary,
      recommendedServices: run.recommendedServices,
      rawResponse: run.rawResponse,
      needsManualReview: run.needsManualReview,
      reviewStatus: run.reviewStatus,
      reviewedBy: run.reviewedBy,
      reviewedAt: undefined,
      reviewNotes: run.reviewNotes,
      createdAt: Date.parse(run.createdAt),
    },
  });

  return fromConvexRun(saved);
}

export async function getAssessmentRun(runId: string): Promise<PersistedAssessmentRun | null> {
  const client = getClient();

  if (client) {
    const run = await (client as any).action("assessmentRuns:getAssessmentRunAction", { runId });
    if (run) {
      return fromConvexRun(run);
    }
  }

  const legacy = legacyRuns.get(runId) ?? null;
  if (legacy) {
    await migrateLegacyRun(legacy);
  }

  return legacy;
}

export async function reviewAssessmentRun(input: ReviewAssessmentRunInput): Promise<PersistedAssessmentRun | null> {
  const client = getClient();

  if (client) {
    const updated = await (client as any).action("assessmentRuns:reviewAssessmentRunAction", {
      runId: input.runId,
      reviewer: input.reviewer,
      status: input.status,
      notes: input.notes,
    });

    if (!updated) {
      return null;
    }

    const persisted = fromConvexRun(updated);
    legacyRuns.set(persisted.runId, persisted);
    return persisted;
  }

  const current = legacyRuns.get(input.runId);

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

  legacyRuns.set(updated.runId, updated);
  return updated;
}
