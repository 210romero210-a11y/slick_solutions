export type AssessmentPolicyInput = {
  confidence: number;
  severity: "minor" | "moderate" | "major" | "critical";
  source: "ollama" | "heuristic_fallback";
};

export function shouldRequireManualReview(input: AssessmentPolicyInput): boolean {
  if (input.source === "heuristic_fallback") {
    return true;
  }

  if (input.confidence < 0.65) {
    return true;
  }

  if ((input.severity === "major" || input.severity === "critical") && input.confidence < 0.8) {
    return true;
  }

  return false;
}
