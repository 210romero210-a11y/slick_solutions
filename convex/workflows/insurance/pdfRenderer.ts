import * as crypto from "node:crypto";

import { InsuranceReportInput, InsuranceReportPdfRenderResult } from "../types";

const TEMPLATE_VERSION = "insurance-report-v1";
const SOURCE_MODELS = ["inspection-agent-v1", "damage-classifier-v2", "condition-narrator-v1"];

function normalizeText(value: string): string {
  return value.replace(/[()\\]/g, "\\$&").replace(/\r?\n/g, " ");
}

function buildContentLines(input: InsuranceReportInput): string[] {
  const generatedAt = new Date().toISOString();

  const incidentSummary = [
    "Incident Summary",
    `Inspection: ${input.inspection.inspectionId}`,
    `VIN: ${input.inspection.vin}`,
    `Customer: ${input.inspection.contact.fullName}`,
    `Tenant: ${input.inspection.tenantSlug}`,
    `Summary: ${input.inspection.damageSummary ?? "No summary provided"}`,
  ];

  const damageRows = [
    "Damage Table (Severity / Category / Confidence)",
    ...input.damageClassifications.map(
      (damage, index) =>
        `${index + 1}. ${damage.area} | ${damage.severity} | ${damage.category} | ${(damage.confidence * 100).toFixed(1)}%`,
    ),
  ];

  const beforePhotos = [
    "Before Photo Grid",
    ...input.beforePhotos.map((photo, index) => `${index + 1}. ${photo.label}: ${photo.url}`),
  ];

  const afterPhotos = [
    "After Photo Grid",
    ...input.afterPhotos.map((photo, index) => `${index + 1}. ${photo.label}: ${photo.url}`),
  ];

  const narrative = ["AI Condition Narrative", input.aiConditionNarrative];

  const metadataFooter = [
    "Metadata",
    `Generated At: ${generatedAt}`,
    `Template Version: ${TEMPLATE_VERSION}`,
    `Source Models: ${SOURCE_MODELS.join(", ")}`,
  ];

  return [...incidentSummary, "", ...damageRows, "", ...beforePhotos, "", ...afterPhotos, "", ...narrative, "", ...metadataFooter];
}

function createPdfFromLines(lines: string[]): Uint8Array {
  const lineHeight = 14;
  const startX = 48;
  const startY = 760;

  const streamLines = lines.slice(0, 45).map((line, index) => {
    const y = startY - index * lineHeight;
    return `BT /F1 11 Tf ${startX} ${y} Td (${normalizeText(line)}) Tj ET`;
  });

  const stream = `${streamLines.join("\n")}\n`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}endstream endobj`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${offsets[i].toString().padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

export function renderInsuranceReportPdf(input: InsuranceReportInput): InsuranceReportPdfRenderResult {
  const generatedAt = new Date().toISOString();
  const lines = buildContentLines(input);
  const pdfBytes = createPdfFromLines(lines);
  const hash = crypto.createHash("sha256").update(pdfBytes).digest("hex");
  const artifactKey = `insurance-reports/${input.inspection.inspectionId}/${generatedAt}-${hash.slice(0, 12)}.pdf`;

  return {
    fileName: `${input.inspection.inspectionId}-claim-report.pdf`,
    mimeType: "application/pdf",
    byteLength: pdfBytes.byteLength,
    sections: [
      "Incident Summary",
      "Damage Table",
      "Before Photo Grid",
      "After Photo Grid",
      "AI Condition Narrative",
      "Metadata Footer",
    ],
    generatedAt,
    pdfBytes,
    artifactKey,
    templateVersion: TEMPLATE_VERSION,
    sourceModels: SOURCE_MODELS,
    hash,
  };
}
