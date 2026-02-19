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

  leads: defineTable({
    ...tenantScopedFields,
    email: v.string(),
    vehicleVin: v.string(),
    consentToContact: v.boolean(),
    status: v.union(v.literal("accepted"), v.literal("rejected")),
    reason: v.optional(v.string()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_vin", ["tenantId", "vehicleVin"]),

  vinProfiles: defineTable({
    ...tenantScopedFields,
    vehicleId: v.id("vehicles"),
    vin: v.string(),
    profile: v.any(),
    signals: v.any(),
    embedding: v.array(v.number()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_vehicle", ["tenantId", "vehicleId"])
    .index("by_tenant_vin", ["tenantId", "vin"]),

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
    correlationId: v.optional(v.string()),
    quoteVersion: v.number(),
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
    ruleVersion: v.optional(v.number()),
  })
    .index("by_tenant_code", ["tenantId", "code"])
    .index("by_tenant_priority", ["tenantId", "priority"])
    .index("by_tenant_active", ["tenantId", "isActive"])
    .vectorIndex("by_tenant_pricing_rule_embedding", {
      vectorField: "pricingRuleEmbedding",
      dimensions: EMBEDDING_DIMS.pricingRule,
      filterFields: ["tenantId"],
    }),

  pricingCoefficients: defineTable({
    ...tenantScopedFields,
    category: v.union(
      v.literal("VSF"),
      v.literal("CF"),
      v.literal("CAF"),
      v.literal("LLF"),
      v.literal("MRF"),
      v.literal("RRF"),
      v.literal("Upsell"),
      v.literal("Discount"),
    ),
    key: v.string(),
    multiplier: v.optional(v.number()),
    value: v.optional(v.number()),
    effectiveFrom: v.number(),
    effectiveTo: v.optional(v.number()),
    version: v.number(),
    isActive: v.boolean(),
  })
    .index("by_tenant_category_key", ["tenantId", "category", "key"])
    .index("by_tenant_version", ["tenantId", "version"])
    .index("by_tenant_active_effective_from", ["tenantId", "isActive", "effectiveFrom"]),

  pricingCalculations: defineTable({
    ...tenantScopedFields,
    quoteId: v.optional(v.id("quotes")),
    inspectionId: v.optional(v.id("inspections")),
    vehicleId: v.optional(v.id("vehicles")),
    input: v.any(),
    output: v.any(),
    ...auditFields,
  })
    .index("by_tenant_quote", ["tenantId", "quoteId"])
    .index("by_tenant_inspection", ["tenantId", "inspectionId"])
    .index("by_tenant_vehicle", ["tenantId", "vehicleId"])
    .index("by_tenant_created_at", ["tenantId", "createdAt"]),

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
    metadata: v.optional(v.any()),
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

  actionRateLimits: defineTable({
    tenantKey: v.string(),
    operation: v.string(),
    windowStart: v.number(),
    count: v.number(),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant_operation_window", ["tenantKey", "operation", "windowStart"])
    .index("by_expires_at", ["expiresAt"]),


  quoteSnapshots: defineTable({
    tenantId: v.id("tenants"),
    quoteId: v.id("quotes"),
    pricingRuleVersion: v.optional(v.number()),
    coefficientSnapshot: v.any(),
    rawAiOutput: v.optional(v.any()),
    vinSignals: v.optional(v.any()),
    calculationTrace: v.optional(v.any()),
    snapshotEvent: v.union(v.literal("quote_created"), v.literal("quote_revised"), v.literal("quote_finalized")),
    pricingInputPayload: v.any(),
    normalizedContext: v.any(),
    ruleMetadata: v.any(),
    computedLineItems: v.array(v.any()),
    computedTotals: v.any(),
    snapshotAt: v.number(),
    actorId: v.optional(v.id("users")),
    actorSource: v.string(),
  })
    .index("by_tenant_quote", ["tenantId", "quoteId"])
    .index("by_tenant_quote_snapshot_at", ["tenantId", "quoteId", "snapshotAt"])
    .index("by_tenant_snapshot_event", ["tenantId", "snapshotEvent", "snapshotAt"])
    .index("by_tenant_pricing_rule_version", ["tenantId", "pricingRuleVersion", "snapshotAt"]),

  quoteTransitionEvents: defineTable({
    tenantId: v.id("tenants"),
    quoteId: v.string(),
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

  assessmentRuns: defineTable({
    runId: v.string(),
    inspectionId: v.string(),
    correlationId: v.optional(v.string()),
    tenantSlug: v.string(),
    vin: v.string(),
    model: v.string(),
    source: v.union(v.literal("ollama"), v.literal("heuristic_fallback")),
    severity: v.union(v.literal("minor"), v.literal("moderate"), v.literal("major"), v.literal("critical")),
    confidence: v.number(),
    summary: v.string(),
    recommendedServices: v.array(v.string()),
    rawResponse: v.optional(v.string()),
    preNormalizationPayload: v.optional(v.any()),
    postNormalizationPayload: v.optional(v.any()),
    validationAdjustments: v.optional(v.array(v.any())),
    validationReasons: v.optional(v.array(v.string())),
    needsManualReview: v.boolean(),
    reviewStatus: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    reviewNotes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_run_id", ["runId"])
    .index("by_tenant_slug", ["tenantSlug"])
    .index("by_tenant_review_status", ["tenantSlug", "reviewStatus"])
    .index("by_tenant_created_at", ["tenantSlug", "createdAt"])
    .index("by_tenant_reviewed_at", ["tenantSlug", "reviewedAt"]),

  assessmentReviewDecisions: defineTable({
    runId: v.string(),
    tenantSlug: v.string(),
    reviewStatus: v.union(v.literal("approved"), v.literal("rejected")),
    reviewer: v.string(),
    notes: v.optional(v.string()),
    reviewedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_run_id", ["runId"])
    .index("by_tenant_slug", ["tenantSlug"])
    .index("by_tenant_review_status", ["tenantSlug", "reviewStatus"])
    .index("by_tenant_reviewed_at", ["tenantSlug", "reviewedAt"]),

  aiSubmissions: defineTable({
    runId: v.string(),
    tenantSlug: v.string(),
    inspectionId: v.string(),
    quoteId: v.optional(v.id("quotes")),
    correlationId: v.string(),
    source: v.string(),
    requestPayload: v.any(),
    createdAt: v.number(),
  })
    .index("by_run_id", ["runId"])
    .index("by_correlation_id", ["correlationId"])
    .index("by_tenant_slug", ["tenantSlug"]),

  aiSignals: defineTable({
    tenantId: v.id("tenants"),
    quoteId: v.optional(v.id("quotes")),
    inspectionId: v.optional(v.id("inspections")),
    assessmentRunId: v.optional(v.string()),
    correlationId: v.string(),
    signalType: v.string(),
    normalizedPayload: v.any(),
    validationStatus: v.union(v.literal("validated"), v.literal("needs_review"), v.literal("rejected")),
    validationNotes: v.optional(v.string()),
    validatedAt: v.number(),
    ...auditFields,
  })
    .index("by_tenant_quote", ["tenantId", "quoteId"])
    .index("by_tenant_inspection", ["tenantId", "inspectionId"])
    .index("by_correlation_id", ["correlationId"]),

  aiSignalEvents: defineTable({
    tenantId: v.id("tenants"),
    aiSignalId: v.optional(v.id("aiSignals")),
    quoteId: v.optional(v.id("quotes")),
    inspectionId: v.optional(v.id("inspections")),
    assessmentRunId: v.optional(v.string()),
    correlationId: v.string(),
    eventType: v.union(v.literal("captured"), v.literal("normalized"), v.literal("validated"), v.literal("replayed")),
    rawPayload: v.optional(v.any()),
    normalizedPayload: v.optional(v.any()),
    validationNotes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_tenant_ai_signal", ["tenantId", "aiSignalId", "createdAt"])
    .index("by_tenant_quote", ["tenantId", "quoteId", "createdAt"])
    .index("by_correlation_id", ["correlationId", "createdAt"]),

  pricingLineage: defineTable({
    tenantId: v.id("tenants"),
    quoteId: v.id("quotes"),
    quoteVersion: v.number(),
    inspectionId: v.optional(v.id("inspections")),
    assessmentRunId: v.optional(v.string()),
    correlationId: v.string(),
    artifact: v.any(),
    createdAt: v.number(),
  })
    .index("by_quote_version", ["quoteId", "quoteVersion"])
    .index("by_correlation_id", ["correlationId"])
    .index("by_tenant_quote_version", ["tenantId", "quoteId", "quoteVersion"]),

  aiInspectionSubmissions: defineTable({
    ...tenantScopedFields,
    quoteId: v.string(),
    imageUrls: v.array(v.string()),
    vin: v.string(),
    notes: v.optional(v.string()),
    idempotencyKey: v.string(),
    status: v.union(v.literal("PENDING"), v.literal("PROCESSING"), v.literal("COMPLETE"), v.literal("FAILED")),
    aiRunId: v.optional(v.id("agentRuns")),
    providerRunId: v.optional(v.string()),
    rawAiPayload: v.optional(v.any()),
    normalizedSignals: v.optional(v.any()),
    processingStartedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    errorMetadata: v.optional(v.any()),
  })
    .index("by_tenant_quote", ["tenantId", "quoteId"])
    .index("by_tenant_status", ["tenantId", "status"])
    .index("by_tenant_idempotency_key", ["tenantId", "idempotencyKey"]),
});
