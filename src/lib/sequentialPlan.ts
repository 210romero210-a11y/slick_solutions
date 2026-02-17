export type TaskStatus = "pending" | "in_progress" | "completed";

export type MiniTask = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  acceptanceCriteria: string[];
};

export type PlanPhase = {
  id: string;
  title: string;
  objective: string;
  tasks: MiniTask[];
};

export const sequentialImplementationPlan: PlanPhase[] = [
  {
    id: "phase-1",
    title: "Foundation",
    objective: "Set up tenant-aware platform primitives and onboarding baseline.",
    tasks: [
      {
        id: "1.1",
        title: "Tenant onboarding contract",
        description: "Define typed onboarding request/response contracts for organization setup and QR issuance.",
        status: "completed",
        acceptanceCriteria: [
          "Tenant onboarding contracts cover request and response payloads.",
          "Runtime validation rejects malformed onboarding payloads.",
          "Contract and typecheck pass for onboarding API paths.",
        ],
      },
      {
        id: "1.2",
        title: "Static QR destination",
        description: "Route each tenant to a branded self-assessment landing page.",
        status: "completed",
        acceptanceCriteria: [
          "Tenant QR destination resolves to tenant-specific branded page.",
          "Route behavior is deterministic across environments.",
          "Contract and typecheck pass for route parameters and response shape.",
        ],
      },
      {
        id: "1.3",
        title: "Strict validation",
        description: "Validate every API input/output with Zod schemas.",
        status: "completed",
        acceptanceCriteria: [
          "All sequential API boundaries enforce runtime schema validation.",
          "Invalid payloads return typed error payloads.",
          "Contract and typecheck pass for validated endpoints.",
        ],
      },
    ],
  },
  {
    id: "phase-2",
    title: "Customer Self-Assessment",
    objective: "Collect contact, VIN, and condition signals in a mobile-first flow.",
    tasks: [
      {
        id: "2.1",
        title: "Customer intake flow",
        description: "Capture customer identity, consent, and vehicle profile in one submission.",
        status: "in_progress",
        acceptanceCriteria: [
          "Customer intake data is persisted in Convex as canonical source of truth.",
          "VIN decode is wired to live intake flow and enriches downstream context.",
          "Contract and typecheck pass for intake submission and response payloads.",
        ],
      },
      {
        id: "2.2",
        title: "Inspection orchestration",
        description: "Run a sequential event timeline from intake to AI quote-ready state.",
        status: "in_progress",
        acceptanceCriteria: [
          "Sequential orchestration state transitions are persisted in Convex.",
          "No in-memory-only state is used for canonical orchestration timeline.",
          "Contract and typecheck pass for orchestration events and status reads.",
        ],
      },
      {
        id: "2.3",
        title: "Assessment API",
        description: "Provide typed API endpoint for assessment submission and response payload.",
        status: "in_progress",
        acceptanceCriteria: [
          "Assessment API returns persisted run identifiers from Convex.",
          "No stubbed success response path is used for production submissions.",
          "Contract and typecheck pass for assessment input/output models.",
        ],
      },
    ],
  },
  {
    id: "phase-3",
    title: "Pricing + Booking",
    objective: "Generate explainable estimate ranges and convert accepted estimates to bookings.",
    tasks: [
      {
        id: "3.1",
        title: "Dynamic pricing engine",
        description: "Compute quote totals using tenant base pricing and condition multipliers.",
        status: "in_progress",
        acceptanceCriteria: [
          "Pricing inputs include decoded VIN classification in live flow.",
          "AI triage uses provider-backed output for primary scoring path.",
          "Contract and typecheck pass for quote calculation payloads.",
        ],
      },
      {
        id: "3.2",
        title: "Booking acceptance",
        description: "Convert approved estimate into a scheduled booking artifact.",
        status: "in_progress",
        acceptanceCriteria: [
          "Approved estimate transitions are persisted and queryable in Convex.",
          "Booking creation path consumes non-stub estimate and review state.",
          "Contract and typecheck pass for booking acceptance APIs.",
        ],
      },
      {
        id: "3.3",
        title: "Stripe + SMS provider integration",
        description: "Wire real Stripe deposits and SMS quote delivery without provider stubs.",
        status: "in_progress",
        acceptanceCriteria: [
          "No stubbed provider responses for Stripe payment or SMS delivery paths.",
          "Payment and delivery events are persisted in Convex with status history.",
          "Contract and typecheck pass for payment and notification endpoints.",
        ],
      },
    ],
  },
  {
    id: "phase-4",
    title: "Next Agents",
    objective: "Expand AI assistants and durable workflows.",
    tasks: [
      {
        id: "4.1",
        title: "Vision model connection",
        description: "Replace heuristic triage fallback with production-grade Ollama Llama 3.2 Vision inference.",
        status: "in_progress",
        acceptanceCriteria: [
          "Primary triage path is provider-backed and does not depend on heuristic fallback.",
          "Fallback behavior is explicit, observable, and non-primary.",
          "Contract and typecheck pass for model request and normalized output.",
        ],
      },
      {
        id: "4.2",
        title: "RAG recommendations",
        description: "Use Convex vector retrieval to suggest upsells based on similar inspections.",
        status: "pending",
        acceptanceCriteria: [
          "Embeddings are stored and indexed in Convex for retrieval.",
          "Recommendation outputs are tied to relevant retrieved context.",
          "Contract and typecheck pass for recommendation APIs.",
        ],
      },
      {
        id: "4.3",
        title: "Durable cost-aware agents",
        description: "Track and control AI costs with durable execution and retry policies.",
        status: "pending",
        acceptanceCriteria: [
          "Agent execution state and cost telemetry persist durably in Convex.",
          "Retries and failure states are visible and auditable.",
          "Contract and typecheck pass for agent control and reporting surfaces.",
        ],
      },
    ],
  },
];
