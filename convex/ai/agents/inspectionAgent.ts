import type { AgentDefinition } from "../agentRunner";
import { validateAgentOutput, type InspectionOutput } from "../schemas";
import { readMemoryHighlights } from "./common";

export type InspectionAgentInput = {
  vin: string;
  notes?: string;
};

export const inspectionAgent: AgentDefinition<InspectionAgentInput, InspectionOutput> = {
  name: "inspectionAgent",
  namespace: "inspection",
  memoryLimit: 8,
  execute: async (input, context) => {
    const vinProfile = await context.tools.invoke<{ vin: string }, { decoded: { year: number; make: string; model: string } }>(
      "vin.retrieve",
      { vin: input.vin },
      context,
    );

    const evidence = await context.tools.invoke<{ query: string; limit: number }, Array<{ snippet: string }>>(
      "vector.retrieve",
      {
        query: `${input.vin} ${input.notes ?? ""}`.trim(),
        limit: 3,
      },
      context,
    );

    const checklist: InspectionOutput["checklist"] = [
      { item: "Exterior panels", status: "pass" },
      { item: "Lighting and lenses", status: "unknown" },
    ];

    if (input.notes) {
      checklist[1] = { item: "Lighting and lenses", status: "unknown", notes: input.notes };
    }

    const output: InspectionOutput = {
      summary: `${vinProfile.decoded.year} ${vinProfile.decoded.make} ${vinProfile.decoded.model} inspection triaged with ${evidence.length} similar cases.`,
      checklist,
      recommendedActions: [...readMemoryHighlights(context), ...evidence.map((item) => item.snippet)].slice(0, 4),
    };

    return validateAgentOutput("inspection", output);
  },
};
