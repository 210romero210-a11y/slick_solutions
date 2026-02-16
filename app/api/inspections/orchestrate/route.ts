import { NextRequest, NextResponse } from "next/server";
import { orchestrateInspection, type InspectionRecord } from "../../../../convex/workflows";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as InspectionRecord;
  const inspection = orchestrateInspection(body);
  return NextResponse.json({ inspection }, { status: 200 });
}
