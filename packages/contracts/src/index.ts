import { z } from "zod";

export const TenantIdSchema = z.string().uuid();

export const CreateLeadRequestSchema = z.object({
  tenantId: TenantIdSchema,
  email: z.string().email(),
  vehicleVin: z.string().length(17),
  consentToContact: z.boolean(),
});

export const CreateLeadResponseSchema = z.object({
  id: z.string(),
  status: z.enum(["accepted", "rejected"]),
  reason: z.string().optional(),
});

export const DecodeVinRequestSchema = z.object({
  vin: z.string().length(17),
});

export const DecodeVinResponseSchema = z.object({
  make: z.string(),
  model: z.string(),
  modelYear: z.string(),
});

export const SelfAssessmentPhotoSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["front", "rear", "left", "right", "interior", "detail"]),
  uploadedAt: z.string().datetime(),
});

export const AssessmentSubmissionRequestSchema = z.object({
  requestId: z.string().min(1),
  tenantSlug: z.string().min(1),
  customer: z.object({
    fullName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(7),
  }),
  vehicle: z.object({
    vin: z.string().length(17),
    plate: z.string().optional(),
  }),
  assessment: z.object({
    interiorContaminationLevel: z.enum(["none", "light", "moderate", "heavy"]),
    requestsCeramicCoating: z.boolean(),
    notes: z.string().optional(),
  }),
  pricing: z.object({
    baseExteriorServicePriceCents: z.number().int().positive(),
    taxRate: z.number().min(0).max(0.2),
    currency: z.string().length(3),
  }),
  photos: z.array(SelfAssessmentPhotoSchema).min(1),
});

export const EstimateLineItemSchema = z.object({
  code: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  totalPriceCents: z.number().int().nonnegative(),
  source: z.enum(["base", "ai_dynamic", "upsell"]),
});

export const InspectionStateSchema = z.enum([
  "portal_started",
  "contact_captured",
  "vin_captured",
  "photos_uploaded",
  "agent_damage_triage",
  "agent_cost_estimate",
  "quote_ready",
  "quote_delivered",
  "report_generated",
]);

export const AssessmentSubmissionResponseSchema = z.object({
  inspectionId: z.string(),
  status: z.enum(["needs_more_photos", "estimate_generated"]),
  message: z.string(),
  estimate: z
    .object({
      subtotalCents: z.number().int().nonnegative(),
      taxCents: z.number().int().nonnegative(),
      totalCents: z.number().int().nonnegative(),
      currency: z.string().length(3),
      lineItems: z.array(EstimateLineItemSchema),
      confidence: z.enum(["low", "medium", "high"]),
    })
    .optional(),
  timeline: z.array(
    z.object({
      state: InspectionStateSchema,
      actor: z.enum(["customer", "system", "agent"]),
      at: z.string().datetime(),
      metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
    }),
  ),
});

export type CreateLeadRequest = z.infer<typeof CreateLeadRequestSchema>;
export type CreateLeadResponse = z.infer<typeof CreateLeadResponseSchema>;
export type DecodeVinRequest = z.infer<typeof DecodeVinRequestSchema>;
export type DecodeVinResponse = z.infer<typeof DecodeVinResponseSchema>;
export type SelfAssessmentPhoto = z.infer<typeof SelfAssessmentPhotoSchema>;
export type AssessmentSubmissionRequest = z.infer<typeof AssessmentSubmissionRequestSchema>;
export type EstimateLineItem = z.infer<typeof EstimateLineItemSchema>;
export type InspectionState = z.infer<typeof InspectionStateSchema>;
export type AssessmentSubmissionResponse = z.infer<typeof AssessmentSubmissionResponseSchema>;
