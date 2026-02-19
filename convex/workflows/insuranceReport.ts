import { InsuranceReportInput, InsuranceReportPdfRenderResult } from "./types";
import { renderInsuranceReportPdf } from "./insurance/pdfRenderer";

export function generateInsuranceReport(input: InsuranceReportInput): InsuranceReportPdfRenderResult {
  return renderInsuranceReportPdf(input);
}
