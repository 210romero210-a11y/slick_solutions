import { NextRequest, NextResponse } from "next/server";

import { bookingRequestSchema, bookingResponseSchema } from "@/lib/intakeSchemas";
import { createBooking } from "@/lib/sequentialEngine";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const json = await request.json();
  const parsed = bookingRequestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const response = bookingResponseSchema.parse(await createBooking(parsed.data));
  return NextResponse.json(response, { status: 201 });
}
