import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const signingSecret = process.env.SELF_ASSESSMENT_UPLOAD_SECRET ?? "local-dev-upload-secret";

const signUploadToken = (payload: string): string => createHmac("sha256", signingSecret).update(payload).digest("hex");

const parseToken = (token: string): { uploadId: string; expiresAtMs: number } | null => {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  const expectedSignature = signUploadToken(payload);
  if (expectedSignature !== signature) {
    return null;
  }

  const decoded = JSON.parse(payload) as { uploadId?: string; expiresAtMs?: number };
  if (!decoded.uploadId || typeof decoded.expiresAtMs !== "number") {
    return null;
  }

  return {
    uploadId: decoded.uploadId,
    expiresAtMs: decoded.expiresAtMs,
  };
};

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

export async function PUT(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { token } = await context.params;
  const uploadToken = parseToken(token);

  if (!uploadToken) {
    return NextResponse.json({ message: "Invalid upload token." }, { status: 401 });
  }

  if (Date.now() > uploadToken.expiresAtMs) {
    return NextResponse.json({ message: "Upload token expired." }, { status: 410 });
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return NextResponse.json({ message: "Missing or invalid content-length for upload." }, { status: 400 });
  }

  await request.arrayBuffer();

  return NextResponse.json({
    storageId: `convex-storage-${uploadToken.uploadId}`,
  });
}
