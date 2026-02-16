import { InsuranceReportArtifact, InsuranceReportInput } from "./types";

function buildSectionTitles(input: InsuranceReportInput): string[] {
  return [
    "Claim Overview",
    `VIN: ${input.inspection.vin}`,
    `Damage Classifications (${input.damageClassifications.length})`,
    `Before Photos (${input.beforePhotos.length})`,
    `After Photos (${input.afterPhotos.length})`,
    "AI Condition Narrative",
  ];
}

export function generateInsuranceReport(input: InsuranceReportInput): InsuranceReportArtifact {
  const sections = buildSectionTitles(input);

  // Placeholder PDF byte-size estimator. In production this would call a dedicated PDF service.
  const estimatedBytes =
    32_000 +
    input.beforePhotos.length * 2_000 +
    input.afterPhotos.length * 2_500 +
    input.damageClassifications.length * 750 +
    input.aiConditionNarrative.length * 2;

  return {
    fileName: `${input.inspection.inspectionId}-claim-report.pdf`,
    mimeType: "application/pdf",
    byteLength: estimatedBytes,
    sections,
    generatedAt: new Date().toISOString(),
  };
}
