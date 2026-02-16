# Slick Solutions Sequential Implementation Map

This codebase now implements a sequential foundation for the self-assessment workflow in this order:

1. **Customer intake capture** (name, email, phone)
2. **Vehicle VIN intake** (17-char VIN requirement)
3. **Guided photo checklist selection**
4. **Condition indicators** (contamination + ceramic request)
5. **AI damage triage stage** (workflow state)
6. **AI dynamic pricing stage** (workflow state)
7. **Quote generation + delivery state**

## Implemented files

- Contracts: `packages/contracts/src/index.ts`
- Pipeline: `convex/workflows/selfAssessmentPipeline.ts`
- API endpoint: `app/api/self-assessments/[tenantSlug]/submit/route.ts`
- UI workflow: `app/[tenantSlug]/inspect/page.tsx`

## Next sequential tasks to continue implementation

1. Replace checklist-only media with signed uploads to Convex file storage.
2. Integrate VIN decode service and enrich pricing by vehicle class.
3. Call Ollama Cloud for live image triage instead of deterministic score.
4. Persist assessment + estimate records in Convex tables.
5. Add staff review/approval panel before quote publication.
6. Connect Stripe for deposit acceptance from approved quote.
