import { NextRequest, NextResponse } from "next/server";
import { deliverQuoteSmsStub, deliverQuoteWeb, orchestrateInspection } from "../../../../../convex/workflows";

export async function POST(request: NextRequest, context: { params: Promise<{ inspectionId: string }> }) {
  const formData = await request.formData();
  const { inspectionId } = await context.params;

  const inspection = orchestrateInspection({
    inspectionId,
    tenantSlug: "default",
    vin: String(formData.get("vin") ?? "UNKNOWNVIN00000000"),
    contact: {
      fullName: String(formData.get("fullName") ?? "Unknown Customer"),
      email: String(formData.get("email") ?? "unknown@example.com"),
      phone: String(formData.get("phone") ?? "+10000000000"),
    },
    photos: [],
    timeline: [],
  });

  const webDelivery = deliverQuoteWeb(inspection);
  const smsDelivery = deliverQuoteSmsStub(inspection);

  return NextResponse.json({ inspection, delivery: { webDelivery, smsDelivery } }, { status: 200 });
}
