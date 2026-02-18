import test from "node:test";
import assert from "node:assert/strict";

import { createEstimate, replayEstimateTotalFromArtifact } from "./pricingService.ts";
import type { PricingEngineInput } from "./types.ts";

const replayFixture: PricingEngineInput = {
  aiAvailable: false,
  quoteVersion: 3,
  correlationId: "corr_quote_replay_001",
  vin: {
    vin: "1HGCM82633A004352",
    make: "Honda",
    model: "Accord",
    year: 2018,
    mileage: 62450,
  },
  damageFindings: [
    {
      panel: "front bumper",
      type: "scratch",
      severity: "moderate",
      confidence: 0.91,
    },
    {
      panel: "rear door",
      type: "dent",
      severity: "minor",
      confidence: 0.82,
    },
  ],
  historicalMatches: [
    {
      jobId: "job_hist_001",
      similarity: 0.94,
      totalPrice: 1350,
      laborHours: 6.5,
      tags: ["scratch", "bumper"],
    },
  ],
  tenantRules: [
    {
      id: "rule_rush_fee",
      description: "Apply rush service surcharge",
      enabled: true,
      appliesTo: () => true,
      adjustPrice: (subtotal) => subtotal * 1.08,
    },
    {
      id: "rule_certified_tech",
      description: "Additional certified labor",
      enabled: true,
      appliesTo: () => true,
      adjustLabor: (laborHours) => laborHours + 1.5,
    },
  ],
  laborPrediction: {
    baseHours: 5,
    confidence: 0.77,
    componentHours: {
      prep: 1.5,
      sanding: 2,
      polish: 1.5,
    },
  },
  riskMultipliers: {
    market: 1.04,
    claimFraud: 1,
    seasonal: 1.06,
    partsAvailability: 1.02,
  },
};

test("replays quote total deterministically from saved pricing artifact", async () => {
  const estimate = await createEstimate(replayFixture);

  assert.ok(estimate.artifact, "artifact should be emitted for replay");
  assert.equal(estimate.artifact?.correlationId, replayFixture.correlationId);
  assert.equal(estimate.artifact?.quoteVersion, replayFixture.quoteVersion);

  const replayedTotal = replayEstimateTotalFromArtifact(estimate.artifact!);

  assert.equal(replayedTotal, estimate.total);
  assert.deepEqual(estimate.artifact?.matchedRuleIds, ["rule_rush_fee", "rule_certified_tech"]);
});
