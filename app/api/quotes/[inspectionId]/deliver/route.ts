import { QuoteDeliveryResponseSchema } from "@slick/contracts";
import { NextRequest, NextResponse } from "next/server";
import {
  deliverQuoteEmail,
  deliverQuoteSms,
  deliverQuoteWeb,
  orchestrateInspection,
} from "../../../../../convex/workflows";

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

  const [smsDelivery, emailDelivery] = await Promise.all([
    deliverQuoteSms(inspection),
    deliverQuoteEmail(inspection),
  ]);
  const webDelivery = deliverQuoteWeb(inspection);

  const responsePayload = QuoteDeliveryResponseSchema.parse({
    inspectionId: inspection.inspectionId,
    delivery: { web: webDelivery, sms: smsDelivery, email: emailDelivery },
  });

  return NextResponse.json({ inspection, ...responsePayload }, { status: 200 });
}
