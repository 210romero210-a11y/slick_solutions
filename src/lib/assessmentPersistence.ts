import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

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

type StoredRuns = Record<string, PersistedAssessmentRun>;

const storageFilePath = process.env.ASSESSMENT_RUNS_FILE ?? ".slick/assessment-runs.json";

async function ensureStoragePath(): Promise<void> {
  await mkdir(dirname(storageFilePath), { recursive: true });
}

async function loadRuns(): Promise<StoredRuns> {
  await ensureStoragePath();

  try {
    const raw = await readFile(storageFilePath, "utf8");
    const parsed = JSON.parse(raw) as StoredRuns;
    return parsed;
  } catch {
    return {};
  }
}

async function saveRuns(runs: StoredRuns): Promise<void> {
  await ensureStoragePath();
  await writeFile(storageFilePath, JSON.stringify(runs, null, 2), "utf8");
}

export async function createAssessmentRun(input: CreateAssessmentRunInput): Promise<PersistedAssessmentRun> {
  const runs = await loadRuns();
  const run: PersistedAssessmentRun = {
    ...input,
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    reviewStatus: "pending",
  };

  runs[run.runId] = run;
  await saveRuns(runs);
  return run;
}

export async function getAssessmentRun(runId: string): Promise<PersistedAssessmentRun | null> {
  const runs = await loadRuns();
  return runs[runId] ?? null;
}

export async function reviewAssessmentRun(input: ReviewAssessmentRunInput): Promise<PersistedAssessmentRun | null> {
  const runs = await loadRuns();
  const current = runs[input.runId];

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

  runs[updated.runId] = updated;
  await saveRuns(runs);
  return updated;
}
