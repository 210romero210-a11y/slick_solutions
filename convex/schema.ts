import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { EMBEDDING_DIMS, JOB_STATUS, QUOTE_STATUS } from "./model/constants";
import { auditFields, tenantScopedFields } from "./model/fields";

export default defineSchema({
  tenants: defineTable({
    name: v.string(),
    slug: v.string(),
    settings: v.optional(v.any()),
    ...auditFields,
  })
    .index("by_slug", ["slug"])
    .index("by_created_at", ["createdAt"]),

  users: defineTable({
    email: v.string(),
    fullName: v.string(),
    authSubject: v.string(),
    avatarUrl: v.optional(v.string()),
    defaultTenantId: v.optional(v.id("tenants")),
    ...auditFields,
  })
    .index("by_email", ["email"])
    .index("by_auth_subject", ["authSubject"]),

  tenantMembers: defineTable({
    ...tenantScopedFields,
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("manager"), v.literal("advisor"), v.literal("technician")),
    permissions: v.array(v.string()),
    joinedAt: v.number(),
    invitedBy: v.optional(v.id("users")),
  })
    .index("by_tenant_user", ["tenantId", "userId"])
    .index("by_tenant_role", ["tenantId", "role"]),

  customerProfiles: defineTable({
    ...tenantScopedFields,
    externalCustomerId: v.optional(v.string()),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.any()),
    notes: v.optional(v.string()),
  })
    .index("by_tenant_external_customer", ["tenantId", "externalCustomerId"])
    .index("by_tenant_email", ["tenantId", "email"])
    .index("by_tenant_phone", ["tenantId", "phone"]),

  vehicles: defineTable({
    ...tenantScopedFields,
    customerProfileId: v.id("customerProfiles"),
    vin: v.string(),
    vinEmbedding: v.array(v.number()),
    year: v.number(),
    make: v.string(),
    model: v.string(),
    trim: v.optional(v.string()),
    mileage: v.optional(v.number()),
    plate: v.optional(v.string()),
  })
    .index("by_tenant_customer", ["tenantId", "customerProfileId"])
    .index("by_tenant_vin", ["tenantId", "vin"])
    .index("by_tenant_plate", ["tenantId", "plate"])
    .vectorIndex("by_tenant_vin_embedding", {
      vectorField: "vinEmbedding",
      dimensions: EMBEDDING_DIMS.vin,
      filterFields: ["tenantId"],
    }),

  inspections: defineTable({
    ...tenantScopedFields,
    vehicleId: v.id("vehicles"),
    customerProfileId: v.id("customerProfiles"),
    performedBy: v.optional(v.id("users")),
    inspectionEmbedding: v.array(v.number()),
    status: v.union(v.literal("queued"), v.literal("in_progress"), v.literal("completed"), v.literal("cancelled")),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    summary: v.optional(v.string()),
    rawPayload: v.optional(v.any()),
  })
    .index("by_tenant_vehicle", ["tenantId", "vehicleId"])
    .index("by_tenant_customer", ["tenantId", "customerProfileId"])
    .index("by_tenant_status", ["tenantId", "status"])
    .vectorIndex("by_tenant_inspection_embedding", {
      vectorField: "inspectionEmbedding",
      dimensions: EMBEDDING_DIMS.inspection,
      filterFields: ["tenantId"],
    }),

  inspectionPhotos: defineTable({
    ...tenantScopedFields,
    inspectionId: v.id("inspections"),
    storageId: v.string(),
    contentType: v.optional(v.string()),
    caption: v.optional(v.string()),
    takenAt: v.optional(v.number()),
    uploadedBy: v.optional(v.id("users")),
    tags: v.array(v.string()),
  })
    .index("by_tenant_inspection", ["tenantId", "inspectionId"])
    .index("by_tenant_storage", ["tenantId", "storageId"]),

  damageFindings: defineTable({
    ...tenantScopedFields,
    inspectionId: v.id("inspections"),
    vehicleId: v.id("vehicles"),
    photoIds: v.array(v.id("inspectionPhotos")),
    damageEmbedding: v.array(v.number()),
    severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("critical")),
    category: v.string(),
    area: v.optional(v.string()),
    confidence: v.optional(v.number()),
    description: v.string(),
    recommendedOps: v.array(v.string()),
  })
    .index("by_tenant_inspection", ["tenantId", "inspectionId"])
    .index("by_tenant_vehicle", ["tenantId", "vehicleId"])
    .index("by_tenant_severity", ["tenantId", "severity"])
    .vectorIndex("by_tenant_damage_embedding", {
      vectorField: "damageEmbedding",
      dimensions: EMBEDDING_DIMS.damage,
      filterFields: ["tenantId"],
    }),

  quotes: defineTable({
    ...tenantScopedFields,
    customerProfileId: v.id("customerProfiles"),
    vehicleId: v.id("vehicles"),
    inspectionId: v.optional(v.id("inspections")),
    quoteNumber: v.string(),
    status: v.union(...QUOTE_STATUS.map((status) => v.literal(status))),
    subtotalCents: v.number(),
    taxCents: v.number(),
    totalCents: v.number(),
    currency: v.string(),
    lineItems: v.array(v.any()),
    validUntil: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    declinedAt: v.optional(v.number()),
  })
    .index("by_tenant_quote_number", ["tenantId", "quoteNumber"])
    .index("by_tenant_status", ["tenantId", "status"])
    .index("by_tenant_customer", ["tenantId", "customerProfileId"])
    .index("by_tenant_vehicle", ["tenantId", "vehicleId"]),

  jobs: defineTable({
    ...tenantScopedFields,
    quoteId: v.optional(v.id("quotes")),
    customerProfileId: v.id("customerProfiles"),
    vehicleId: v.id("vehicles"),
    assignedTechnicianId: v.optional(v.id("technicians")),
    status: v.union(...JOB_STATUS.map((status) => v.literal(status))),
    jobNumber: v.string(),
    scheduledStartAt: v.optional(v.number()),
    scheduledEndAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    cancellationReason: v.optional(v.string()),
  })
    .index("by_tenant_job_number", ["tenantId", "jobNumber"])
    .index("by_tenant_status", ["tenantId", "status"])
    .index("by_tenant_quote", ["tenantId", "quoteId"])
    .index("by_tenant_technician", ["tenantId", "assignedTechnicianId"]),

  technicians: defineTable({
    ...tenantScopedFields,
    userId: v.optional(v.id("users")),
    displayName: v.string(),
    employeeNumber: v.optional(v.string()),
    specialties: v.array(v.string()),
    active: v.boolean(),
  })
    .index("by_tenant_user", ["tenantId", "userId"])
    .index("by_tenant_employee_number", ["tenantId", "employeeNumber"])
    .index("by_tenant_active", ["tenantId", "active"]),

  pricingRules: defineTable({
    ...tenantScopedFields,
    code: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    pricingRuleEmbedding: v.array(v.number()),
    conditions: v.any(),
    action: v.any(),
    priority: v.number(),
    isActive: v.boolean(),
  })
    .index("by_tenant_code", ["tenantId", "code"])
    .index("by_tenant_priority", ["tenantId", "priority"])
    .index("by_tenant_active", ["tenantId", "isActive"])
    .vectorIndex("by_tenant_pricing_rule_embedding", {
      vectorField: "pricingRuleEmbedding",
      dimensions: EMBEDDING_DIMS.pricingRule,
      filterFields: ["tenantId"],
    }),

  upsellCatalog: defineTable({
    ...tenantScopedFields,
    sku: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    priceCents: v.number(),
    upsellEmbedding: v.array(v.number()),
    tags: v.array(v.string()),
    active: v.boolean(),
  })
    .index("by_tenant_sku", ["tenantId", "sku"])
    .index("by_tenant_category", ["tenantId", "category"])
    .index("by_tenant_active", ["tenantId", "active"])
    .vectorIndex("by_tenant_upsell_embedding", {
      vectorField: "upsellEmbedding",
      dimensions: EMBEDDING_DIMS.upsell,
      filterFields: ["tenantId"],
    }),

  agentRuns: defineTable({
    ...tenantScopedFields,
    agentName: v.string(),
    runType: v.string(),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("succeeded"), v.literal("failed")),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    input: v.optional(v.any()),
    output: v.optional(v.any()),
    error: v.optional(v.any()),
  })
    .index("by_tenant_agent_name", ["tenantId", "agentName"])
    .index("by_tenant_status", ["tenantId", "status"])
    .index("by_tenant_target", ["tenantId", "targetType", "targetId"]),

  agentMemory: defineTable({
    ...tenantScopedFields,
    namespace: v.string(),
    key: v.string(),
    value: v.any(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_tenant_namespace_key", ["tenantId", "namespace", "key"])
    .index("by_tenant_expires_at", ["tenantId", "expiresAt"]),

  aiUsageLedger: defineTable({
    ...tenantScopedFields,
    provider: v.string(),
    model: v.string(),
    feature: v.string(),
    runId: v.optional(v.id("agentRuns")),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    costMicrosUsd: v.number(),
    requestId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant_feature", ["tenantId", "feature"])
    .index("by_tenant_model", ["tenantId", "model"])
    .index("by_tenant_run", ["tenantId", "runId"])
    .index("by_tenant_created_at", ["tenantId", "createdAt"]),

  quoteTransitionEvents: defineTable({
    tenantId: v.id("tenants"),
    quoteId: v.id("quotes"),
    fromStatus: v.optional(v.union(...QUOTE_STATUS.map((status) => v.literal(status)))),
    toStatus: v.union(...QUOTE_STATUS.map((status) => v.literal(status))),
    reason: v.optional(v.string()),
    eventAt: v.number(),
    actorId: v.optional(v.id("users")),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant_quote_event_at", ["tenantId", "quoteId", "eventAt"])
    .index("by_tenant_to_status", ["tenantId", "toStatus", "eventAt"]),

  jobTransitionEvents: defineTable({
    tenantId: v.id("tenants"),
    jobId: v.id("jobs"),
    fromStatus: v.optional(v.union(...JOB_STATUS.map((status) => v.literal(status)))),
    toStatus: v.union(...JOB_STATUS.map((status) => v.literal(status))),
    reason: v.optional(v.string()),
    eventAt: v.number(),
    actorId: v.optional(v.id("users")),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant_job_event_at", ["tenantId", "jobId", "eventAt"])
    .index("by_tenant_to_status", ["tenantId", "toStatus", "eventAt"]),
});
