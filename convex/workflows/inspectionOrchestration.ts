import { InspectionEvent, InspectionRecord, InspectionState, PhotoAsset } from "./types";

const nowIso = () => new Date().toISOString();

function transition(
  timeline: InspectionEvent[],
  state: InspectionState,
  actor: InspectionEvent["actor"],
  metadata?: InspectionEvent["metadata"],
) {
  timeline.push({ state, actor, metadata, at: nowIso() });
}

function runDamageTriageAgent(photos: PhotoAsset[]): { summary: string; difficultyScore: number } {
  const detailCount = photos.filter((photo) => photo.label === "detail").length;
  const baseDifficulty = Math.min(100, 30 + photos.length * 8 + detailCount * 10);

  return {
    summary:
      detailCount > 0
        ? "Detected panel and trim damage requiring moderate corrective effort."
        : "Detected mostly cosmetic surface damage with low structural concern.",
    difficultyScore: baseDifficulty,
  };
}

function runCostEstimateAgent(difficultyScore: number): number {
  const laborCents = 35000 + difficultyScore * 120;
  const materialsCents = 18000 + difficultyScore * 85;
  return laborCents + materialsCents;
}

export function orchestrateInspection(record: InspectionRecord): InspectionRecord {
  const timeline = [...record.timeline];

  transition(timeline, "portal_started", "customer", { tenantSlug: record.tenantSlug });
  transition(timeline, "contact_captured", "customer", { contactEmail: record.contact.email });
  transition(timeline, "vin_captured", "customer", { vin: record.vin });
  transition(timeline, "photos_uploaded", "customer", { photoCount: record.photos.length });

  transition(timeline, "agent_damage_triage", "agent", { agent: "damage_triage_v1" });
  const triage = runDamageTriageAgent(record.photos);

  transition(timeline, "agent_cost_estimate", "agent", {
    agent: "cost_estimator_v1",
    difficultyScore: triage.difficultyScore,
  });
  const quoteCents = runCostEstimateAgent(triage.difficultyScore);

  transition(timeline, "quote_ready", "system", { quoteCents });

  return {
    ...record,
    timeline,
    damageSummary: triage.summary,
    difficultyScore: triage.difficultyScore,
    quoteCents,
  };
}
