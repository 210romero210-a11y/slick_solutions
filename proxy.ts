import { NextRequest, NextResponse } from "next/server";

const QUOTE_DASHBOARD_PATH = /^\/quotes\/[A-Za-z0-9_-]+$/;

export function proxy(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;

  if (!QUOTE_DASHBOARD_PATH.test(pathname)) {
    return NextResponse.next();
  }

  const tenantId = request.cookies.get("tenantId")?.value;
  if (!tenantId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-id", tenantId);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/quotes/:path*"],
};
