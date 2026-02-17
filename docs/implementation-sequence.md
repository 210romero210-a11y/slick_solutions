# Slick Solutions Sequential Implementation Map

This codebase implements a sequential foundation for the self-assessment workflow in this order:

1. **Customer intake capture** (name, email, phone)
2. **Vehicle VIN intake** (17-char VIN requirement)
3. **Guided photo checklist selection**
4. **Condition indicators** (contamination + ceramic request)
5. **AI damage triage stage**
6. **AI dynamic pricing stage**
7. **Quote generation + delivery state**

## Current implementation reality (explicit partials)

The current system is **partially implemented** and should not be treated as production-complete:

- **AI fallback is active:** heuristic fallback paths are still used when provider calls fail.
- **Persistence is mixed:** some flows persist through Convex, but there is still in-memory fallback persistence behavior.
- **Payments and delivery are stubbed in places:** Stripe/SMS integrations still include placeholder/stub responses in key paths.
- **VIN decode is not fully wired into pricing flow:** VIN capture exists, but end-to-end decode enrichment is not fully integrated into quote computation.

## Implemented files

- Contracts: `packages/contracts/src/index.ts`
- Pipeline: `convex/workflows/selfAssessmentPipeline.ts`
- API endpoint: `app/api/self-assessments/[tenantSlug]/submit/route.ts`
- UI workflow: `app/[tenantSlug]/inspect/page.tsx`

## Sequential tasks with acceptance criteria

1. ✅ **Signed media upload flow**
   - **Status:** Production-ready.
   - **Acceptance criteria:**
     - Upload flow returns durable storage IDs (not checklist-only placeholders).
     - Contract + typecheck pass for upload request/response boundaries.
2. ⚠️ **VIN decode + class-based pricing enrichment**
   - **Status:** Partial / not production-ready.
   - **Acceptance criteria:**
     - VIN decode runs in live submission flow (no dead-path wiring).
     - Decoded vehicle class is applied to quote logic.
     - Contract + typecheck passing for decode-enriched payloads.
3. ⚠️ **Live vision triage provider**
   - **Status:** Partial / not production-ready.
   - **Acceptance criteria:**
     - No heuristic fallback used for normal successful path.
     - Provider errors are observable and do not silently masquerade as success.
     - Contract + typecheck passing for triage output shape.
4. ⚠️ **Durable persistence for assessment + estimate**
   - **Status:** Partial / not production-ready.
   - **Acceptance criteria:**
     - Assessment and estimate records are persisted in Convex.
     - No in-memory-only persistence for canonical workflow state.
     - Contract + typecheck passing between app and persistence layer.
5. ⚠️ **Staff review and approval before publication**
   - **Status:** In progress.
   - **Acceptance criteria:**
     - Review action updates durable status in Convex.
     - Quote cannot be published without explicit approval transition.
     - Contract + typecheck passing for review endpoints.
6. ⚠️ **Payments + outbound delivery wiring (Stripe/SMS)**
   - **Status:** Partial / not production-ready.
   - **Acceptance criteria:**
     - No stubbed provider responses in Stripe/SMS production path.
     - Payment intent + confirmation lifecycle persisted and queryable.
     - Contract + typecheck passing for payment and delivery APIs.

## Definition of Done (roadmap task completion)

A roadmap task may be marked **completed** only when all are true:

1. End-to-end user flow is wired (not scaffold-only, not dead path).
2. Durable state is persisted in Convex for canonical workflow records.
3. No stubbed provider responses in production path (Stripe/SMS/AI/VIN as applicable).
4. All related contracts are updated and validated.
5. Typecheck passes for impacted packages/apps.
6. Any fallback behavior is explicitly non-primary and documented.

If any item above is unmet, use **in_progress** or **pending** in planning artifacts.
