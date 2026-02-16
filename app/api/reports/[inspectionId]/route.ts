import { NextRequest, NextResponse } from "next/server";
import { generateInsuranceReport, InsuranceReportInput } from "../../../../convex/workflows";

export async function POST(request: NextRequest, context: { params: { inspectionId: string } }) {
  const body = (await request.json()) as Omit<InsuranceReportInput, "inspection"> & {
    inspection: InsuranceReportInput["inspection"];
  };

  const report = generateInsuranceReport({
    ...body,
    inspection: {
      ...body.inspection,
      inspectionId: context.params.inspectionId,
    },
  });

  return NextResponse.json({ report }, { status: 200 });
}
