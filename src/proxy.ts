import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

const neonMiddleware = auth?.middleware({
  loginUrl: "/auth/sign-in",
});

export default function proxy(request: NextRequest) {
  console.log("[SKG Proxy] OAuth callback:", {
    pathname: request.nextUrl.pathname,
    hasVerifier: request.nextUrl.searchParams.has(
      "neon_auth_session_verifier"
    ),
    authConfigured: Boolean(neonMiddleware),
  });

  if (!neonMiddleware) {
    return NextResponse.next();
  }

  return neonMiddleware(request);
}

export const config = {
  matcher: ["/auth/complete"],
};