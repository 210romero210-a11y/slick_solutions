import { z } from "zod";

export const TenantIdSchema = z.string().uuid();

export const CreateLeadRequestSchema = z.object({
  tenantId: TenantIdSchema,
  email: z.string().email(),
  vehicleVin: z.string().length(17),
  consentToContact: z.boolean()
});

export const CreateLeadResponseSchema = z.object({
  id: z.string(),
  status: z.enum(["accepted", "rejected"]),
  reason: z.string().optional()
});

export const DecodeVinRequestSchema = z.object({
  vin: z.string().length(17)
});

export const DecodeVinResponseSchema = z.object({
  make: z.string(),
  model: z.string(),
  modelYear: z.string()
});

export type CreateLeadRequest = z.infer<typeof CreateLeadRequestSchema>;
export type CreateLeadResponse = z.infer<typeof CreateLeadResponseSchema>;
export type DecodeVinRequest = z.infer<typeof DecodeVinRequestSchema>;
export type DecodeVinResponse = z.infer<typeof DecodeVinResponseSchema>;
