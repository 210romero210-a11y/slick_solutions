export type TaskStatus = "pending" | "in_progress" | "completed";

export type MiniTask = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
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
      },
      {
        id: "1.2",
        title: "Static QR destination",
        description: "Route each tenant to a branded self-assessment landing page.",
        status: "completed",
      },
      {
        id: "1.3",
        title: "Strict validation",
        description: "Validate every API input/output with Zod schemas.",
        status: "completed",
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
        status: "completed",
      },
      {
        id: "2.2",
        title: "Inspection orchestration",
        description: "Run a sequential event timeline from intake to AI quote-ready state.",
        status: "completed",
      },
      {
        id: "2.3",
        title: "Assessment API",
        description: "Provide typed API endpoint for assessment submission and response payload.",
        status: "completed",
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
        status: "completed",
      },
      {
        id: "3.2",
        title: "Booking acceptance",
        description: "Convert approved estimate into a scheduled booking artifact.",
        status: "completed",
      },
      {
        id: "3.3",
        title: "Stripe-ready integration seam",
        description: "Expose a payment intent placeholder for Stripe deposit flow wiring.",
        status: "completed",
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
        description: "Replace heuristic triage with Ollama Llama 3.2 Vision inference.",
        status: "completed",
      },
      {
        id: "4.2",
        title: "RAG recommendations",
        description: "Use Convex vector retrieval to suggest upsells based on similar inspections.",
        status: "pending",
      },
      {
        id: "4.3",
        title: "Durable cost-aware agents",
        description: "Track and control AI costs with durable execution and retry policies.",
        status: "pending",
      },
    ],
  },
];
