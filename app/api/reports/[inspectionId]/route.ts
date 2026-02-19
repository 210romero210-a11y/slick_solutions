import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";

import { generateInsuranceReport, InsuranceReportInput } from "../../../../convex/workflows";

type ReportStatus =
  | "ready"
  | "invalid_request"
  | "convex_unavailable"
  | "persist_failed"
  | "render_failed"
  | "not_found";

function getConvexClient(): ConvexHttpClient | null {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!convexUrl) {
    return null;
  }

  return new ConvexHttpClient(convexUrl);
}

function decodeBase64Pdf(base64: string): Uint8Array {
  return Buffer.from(base64, "base64");
}

export async function POST(request: NextRequest, context: { params: Promise<{ inspectionId: string }> }) {
  const { inspectionId } = await context.params;

  let body: Omit<InsuranceReportInput, "inspection"> & {
    inspection: InsuranceReportInput["inspection"];
  };

  try {
    body = (await request.json()) as Omit<InsuranceReportInput, "inspection"> & {
      inspection: InsuranceReportInput["inspection"];
    };
  } catch {
    return NextResponse.json({ status: "invalid_request" satisfies ReportStatus, error: "Malformed JSON request body." }, { status: 400 });
  }

  try {
    const report = generateInsuranceReport({
      ...body,
      inspection: {
        ...body.inspection,
        inspectionId,
      },
    });

    const client = getConvexClient();
    if (!client) {
      return NextResponse.json(
        {
          status: "convex_unavailable" satisfies ReportStatus,
          error: "Convex URL is not configured, report artifact could not be persisted.",
        },
        { status: 503 },
      );
    }

    try {
      await (client as any).mutation("insuranceReports:createReportArtifact", {
        inspectionId,
        artifactKey: report.artifactKey,
        fileName: report.fileName,
        mimeType: report.mimeType,
        byteLength: report.byteLength,
        sections: report.sections,
        generatedAt: report.generatedAt,
        generatedAtEpochMs: Date.parse(report.generatedAt),
        hash: report.hash,
        templateVersion: report.templateVersion,
        sourceModels: report.sourceModels,
        reportVersion: 1,
        artifactBase64: Buffer.from(report.pdfBytes).toString("base64"),
      });
    } catch (error) {
      return NextResponse.json(
        {
          status: "persist_failed" satisfies ReportStatus,
          error: "Generated report but failed to persist artifact metadata in Convex.",
          details: error instanceof Error ? error.message : "Unknown persistence error",
        },
        { status: 500 },
      );
    }

    const downloadUrl = `/api/reports/${inspectionId}?artifactKey=${encodeURIComponent(report.artifactKey)}`;

    return NextResponse.json(
      {
        status: "ready" satisfies ReportStatus,
        report: {
          artifactKey: report.artifactKey,
          downloadUrl,
          fileName: report.fileName,
          mimeType: report.mimeType,
          byteLength: report.byteLength,
          generatedAt: report.generatedAt,
          sections: report.sections,
          traceability: {
            inspectionId,
            generatedAt: report.generatedAt,
            sourceModels: report.sourceModels,
            hash: report.hash,
            templateVersion: report.templateVersion,
            reportVersion: 1,
          },
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "render_failed" satisfies ReportStatus,
        error: "Unable to render insurance report PDF.",
        details: error instanceof Error ? error.message : "Unknown rendering error",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ inspectionId: string }> }) {
  const { inspectionId } = await context.params;
  const artifactKey = request.nextUrl.searchParams.get("artifactKey") ?? undefined;

  const client = getConvexClient();
  if (!client) {
    return NextResponse.json(
      {
        status: "convex_unavailable" satisfies ReportStatus,
        error: "Convex URL is not configured, report artifact cannot be retrieved.",
      },
      { status: 503 },
    );
  }

  const record = await (client as any).query("insuranceReports:getReportArtifact", {
    inspectionId,
    artifactKey,
  });

  if (!record) {
    return NextResponse.json(
      {
        status: "not_found" satisfies ReportStatus,
        error: "No persisted report artifact found for inspection.",
      },
      { status: 404 },
    );
  }

  const pdfBytes = decodeBase64Pdf(record.artifactBase64);

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${record.fileName}\"`,
      "X-Artifact-Key": record.artifactKey,
      "X-Report-Hash": record.hash,
      "Cache-Control": "private, max-age=60",
    },
  });
}
