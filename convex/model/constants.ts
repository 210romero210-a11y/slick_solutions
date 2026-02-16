export const EMBEDDING_DIMS = {
  vin: 384,
  pricingRule: 768,
  inspection: 1536,
  damage: 1536,
  upsell: 768,
} as const;

export const QUOTE_STATUS = [
  "draft",
  "review",
  "sent",
  "approved",
  "declined",
  "expired",
  "archived",
] as const;

export const JOB_STATUS = [
  "queued",
  "scheduled",
  "in_progress",
  "awaiting_parts",
  "completed",
  "cancelled",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUS)[number];
export type JobStatus = (typeof JOB_STATUS)[number];
