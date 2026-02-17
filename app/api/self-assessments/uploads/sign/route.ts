import { createHmac, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const signRequestSchema = z.object({
  tenantSlug: z.string().min(1),
  kind: z.enum(["front", "rear", "left", "right", "interior", "detail"]),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive().max(15 * 1024 * 1024),
});

const signingSecret = process.env.SELF_ASSESSMENT_UPLOAD_SECRET ?? "local-dev-upload-secret";

const signUploadToken = function(payload: string) { return createHmac("sha256", signingSecret).update(payload).digest("hex") };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsedBody = signRequestSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        message: "Invalid signed upload request.",
        issues: parsedBody.error.issues,
      },
      { status: 400 }
    );
  }

  const expiresAtMs = Date.now() + 5 * 60 * 1000;
  const uploadId = randomUUID();
  const payload = JSON.stringify({ ...parsedBody.data, uploadId: uploadId, expiresAtMs });
  const signature = signUploadToken(payload);
  const encoded = Buffer.from(payload).toString("base64url");
  const token = ""+encoded+"."+signature;

  return NextResponse.json({
    uploadUrl: "/api/self-assessments/uploads/"+token,
    expiresAt: new Date(expiresAtMs).toISOString(),
  });
}
