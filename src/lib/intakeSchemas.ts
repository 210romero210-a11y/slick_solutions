import { z } from "zod";

export const onboardingRequestSchema = z.object({
  businessName: z.string().min(2),
  tenantSlug: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9-]+$/, "tenantSlug must be lowercase letters, numbers, or dashes"),
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
  basePackagePriceCents: z.number().int().positive(),
});

export const onboardingResponseSchema = z.object({
  tenantId: z.string(),
  tenantSlug: z.string(),
  qrLandingUrl: z.string().url(),
  status: z.literal("provisioned"),
});

export const customerIntakeSchema = z.object({
  tenantSlug: z.string().min(2),
  inspectionId: z.string().min(3),
  contact: z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(7),
  }),
  vin: z.string().length(17).toUpperCase(),
  concernNotes: z.string().max(1000).optional(),
  photoUrls: z.array(z.string().url()).default([]),
  selectedServices: z.array(z.string().min(2)).min(1),
});

export const assessmentResponseSchema = z.object({
  inspectionId: z.string(),
  status: z.literal("quote_ready"),
  difficultyScore: z.number().int().min(0).max(100),
  quoteCents: z.number().int().positive(),
  timelineCount: z.number().int().positive(),
});

export const dynamicPricingRequestSchema = z.object({
  baseServicePriceCents: z.number().int().positive(),
  difficultyScore: z.number().min(0).max(100),
  vehicleSizeMultiplier: z.number().min(0.8).max(2),
  demandMultiplier: z.number().min(0.8).max(2),
  addOnsCents: z.number().int().nonnegative().default(0),
  discountCents: z.number().int().nonnegative().default(0),
});

export const dynamicPricingResponseSchema = z.object({
  subtotalCents: z.number().int(),
  totalCents: z.number().int(),
  appliedConditionMultiplier: z.number(),
  explanation: z.string(),
});

export const bookingRequestSchema = z.object({
  tenantSlug: z.string().min(2),
  inspectionId: z.string().min(3),
  customerEmail: z.string().email(),
  approvedQuoteCents: z.number().int().positive(),
  preferredDateIso: z.string().datetime(),
  requiresDeposit: z.boolean(),
});

export const bookingResponseSchema = z.object({
  bookingId: z.string(),
  status: z.enum(["pending_deposit", "confirmed"]),
  depositCents: z.number().int().nonnegative(),
  paymentIntentClientSecret: z.string().nullable(),
});

export type OnboardingRequest = z.infer<typeof onboardingRequestSchema>;
export type OnboardingResponse = z.infer<typeof onboardingResponseSchema>;
export type CustomerIntake = z.infer<typeof customerIntakeSchema>;
export type AssessmentResponse = z.infer<typeof assessmentResponseSchema>;
export type DynamicPricingRequest = z.infer<typeof dynamicPricingRequestSchema>;
export type DynamicPricingResponse = z.infer<typeof dynamicPricingResponseSchema>;
export type BookingRequest = z.infer<typeof bookingRequestSchema>;
export type BookingResponse = z.infer<typeof bookingResponseSchema>;
