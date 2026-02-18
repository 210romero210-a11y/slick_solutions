import test from "node:test";
import assert from "node:assert/strict";

import type { AISignalPayload, AssessmentSubmissionRequest } from "@slick/contracts";

import { runSelfAssessmentPipeline } from "./selfAssessmentPipeline.ts";

const buildRequest = (): AssessmentSubmissionRequest => ({
  requestId: "req_123",
  tenantSlug: "demo-shop",
  customer: {
    fullName: "Alex Driver",
    email: "alex@example.com",
    phone: "+15555550123",
  },
  vehicle: {
    vin: "1HGCM82633A004352",
  },
  assessment: {
    interiorContaminationLevel: "light",
    requestsCeramicCoating: true,
    notes: "Scratch on left door",
  },
  pricing: {
    baseExteriorServicePriceCents: 50000,
    taxRate: 0.08,
    currency: "USD",
  },
  photos: [
    { id: "1", kind: "front", uploadedAt: new Date().toISOString(), storageId: "a" },
    { id: "2", kind: "rear", uploadedAt: new Date().toISOString(), storageId: "b" },
    { id: "3", kind: "left", uploadedAt: new Date().toISOString(), storageId: "c" },
    { id: "4", kind: "right", uploadedAt: new Date().toISOString(), storageId: "d" },
    { id: "5", kind: "detail", uploadedAt: new Date().toISOString(), storageId: "e" },
  ],
});

const mockSignal = (overrides: Partial<AISignalPayload> = {}): AISignalPayload => ({
  summary: "Detected high paint defects",
  severityBucket: "high",
  confidence: 0.91,
  contaminationLevel: "light",
  damageClass: "cosmetic",
  damageType: "scratch",
  panelMetrics: { totalPanelsObserved: 5, affectedPanels: 2, detailPhotos: 1 },
  ...overrides,
});

test("uses model inference path and reports truthful metadata", async () => {
  const signal = mockSignal();
  const response = await runSelfAssessmentPipeline(buildRequest(), {
    runVisionInference: async () => ({
      ...signal,
      signal,
      provider: "ollama",
      model: "llama3.2-vision",
      fallbackUsed: false,
      runId: "run_1",
      analysisSource: "ollama",
    }),
  });

  assert.equal(response.status, "estimate_generated");
  assert.equal(response.estimate?.confidence, "high");

  const triage = response.timeline.find((entry) => entry.state === "agent_damage_triage");
  assert.ok(triage);
  assert.equal(triage.metadata?.provider, "ollama");
  assert.equal(triage.metadata?.model, "llama3.2-vision");
  assert.equal(triage.metadata?.fallbackUsed, false);
});

test("falls back when model invocation throws and marks metadata accordingly", async () => {
  const response = await runSelfAssessmentPipeline(buildRequest(), {
    runVisionInference: async () => {
      throw new Error("provider timeout");
    },
  });

  assert.equal(response.status, "estimate_generated");
  assert.equal(response.estimate?.confidence, "low");

  const triage = response.timeline.find((entry) => entry.state === "agent_damage_triage");
  assert.ok(triage);
  assert.equal(triage.metadata?.provider, "heuristic");
  assert.equal(triage.metadata?.model, "threshold-fallback");
  assert.equal(triage.metadata?.fallbackUsed, true);
});

test("uses returned confidence and fallback flag from AI runtime response", async () => {
  const signal = mockSignal({
    summary: "Model response invalid, used fallback",
    severityBucket: "medium",
    confidence: 0.6,
    contaminationLevel: "moderate",
    damageClass: "mixed",
    damageType: "stain",
    panelMetrics: { totalPanelsObserved: 5, affectedPanels: 3, detailPhotos: 1 },
  });

  const response = await runSelfAssessmentPipeline(buildRequest(), {
    runVisionInference: async () => ({
      ...signal,
      signal,
      provider: "ollama",
      model: "llama3.2-vision",
      fallbackUsed: true,
      runId: "run_2",
      analysisSource: "heuristic",
    }),
  });

  assert.equal(response.estimate?.confidence, "medium");

  const triage = response.timeline.find((entry) => entry.state === "agent_damage_triage");
  assert.ok(triage);
  assert.equal(triage.metadata?.provider, "ollama");
  assert.equal(triage.metadata?.fallbackUsed, true);
});

test("applies decoded vehicle class multiplier to estimate", async () => {
  const signal = mockSignal();
  const response = await runSelfAssessmentPipeline(
    {
      ...buildRequest(),
      pricing: {
        ...buildRequest().pricing,
        vehicleAttributes: {
          normalizedVehicleClass: "truck",
          normalizedVehicleSize: "fullsize",
          decodedModelYear: 2021,
          decodeFallbackUsed: false,
        },
      },
    },
    {
      runVisionInference: async () => ({
        ...signal,
        signal,
        provider: "ollama",
        model: "llama3.2-vision",
        fallbackUsed: false,
        runId: "run_3",
        analysisSource: "ollama",
      }),
    },
  );

  assert.equal(response.estimate?.appliedVehicleClassMultiplier, 1.18);
  assert.equal(response.estimate?.vehicleAttributes.normalizedVehicleClass, "truck");
});
