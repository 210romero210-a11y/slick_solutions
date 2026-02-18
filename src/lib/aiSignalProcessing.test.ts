import assert from "node:assert/strict";
import test from "node:test";

import type { VehicleAttributes } from "@slick/contracts";

import { normalizeSignals } from "./aiSignalNormalization";
import { validateSignalsForVehicle } from "./aiSignalValidation";
import { processAIInspection } from "./processAIInspection";

const suvAttributes: VehicleAttributes = {
  normalizedVehicleClass: "suv",
  normalizedVehicleSize: "fullsize",
  decodedModelYear: 2022,
  decodeFallbackUsed: false,
};

test("normalizeSignals clamps adversarial values and rounds as expected", () => {
  const normalized = normalizeSignals({
    panelCount: -999,
    contaminationScore: "349.6",
    severityScore: Number.NaN,
    defectCount: "1000",
    paintConditionScore: 74.7,
    severityBuckets: {
      low: -5,
      medium: 4.6,
      high: 999,
      critical: "abc",
    },
  });

  assert.deepEqual(normalized, {
    panelCount: 0,
    contaminationScore: 100,
    severityScore: 0,
    defectCount: 250,
    paintConditionScore: 75,
    severityBuckets: {
      low: 0,
      medium: 5,
      high: 24,
      critical: 0,
    },
  });
});

test("validateSignalsForVehicle applies vehicle-class panel ceiling/floor and paint compatibility", () => {
  const normalized = normalizeSignals({
    panelCount: 30,
    contaminationScore: 50,
    severityScore: 65,
    defectCount: 1,
    paintConditionScore: 100,
    severityBuckets: {
      low: 10,
      medium: 8,
      high: 7,
      critical: 5,
    },
  });

  const result = validateSignalsForVehicle(normalized, suvAttributes);

  assert.equal(result.wasAdjusted, true);
  assert.equal(result.corrected.panelCount, 18);
  assert.equal(result.corrected.paintConditionScore, 95);
  assert.ok(result.corrected.defectCount >= result.corrected.severityBuckets.critical);
  assert.ok(result.reasons.length >= 2);
});

test("processAIInspection records mismatch corrections and audit payloads", async () => {
  const processed = await processAIInspection(
    {
      tenantSlug: "demo-shop",
      inspectionId: "insp_123",
      vin: "1HGCM82633A004352",
      photoUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
      vehicleAttributes: {
        ...suvAttributes,
        normalizedVehicleClass: "sedan",
      },
      concernNotes: "Heavy oxidation and interior staining",
    },
    {
      runVisionInference: async () => ({
        summary: "Severe interior and paint defects detected",
        severity: "critical",
        confidence: 0.8,
        recommendedServices: ["Paint correction", "Interior extraction"],
        provider: "heuristic",
        model: "test-model",
        fallbackUsed: true,
        runId: "run_x",
        analysisSource: "heuristic",
      }),
    },
  );

  assert.equal(processed.vehicleAttributes.normalizedVehicleClass, "sedan");
  assert.ok(processed.validationReasons.length > 0);
  assert.ok(processed.runId.length > 0);
  assert.ok(processed.validatedSignals.panelCount <= 14);
});
