import { NextRequest, NextResponse } from "next/server";
import { assignTechnician, RoutingRequest, TechnicianProfile } from "../../../convex/workflows";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    request: RoutingRequest;
    technicians: TechnicianProfile[];
  };

  const assignment = assignTechnician(body.request, body.technicians);

  if (!assignment) {
    return NextResponse.json({ message: "No eligible technician available." }, { status: 404 });
  }

  return NextResponse.json({ assignment }, { status: 200 });
}
