import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { premiumDestination } from "@/lib/auth/flow";
import { adsEnabled } from "@/lib/ads";
// Checkout is not connected yet. Never activate subscriptions here.
export async function GET(request: Request) {
  const viewer = await getViewer();
  return NextResponse.redirect(
    new URL(
      adsEnabled()
        ? premiumDestination(viewer.authenticated, viewer.premium)
        : viewer.authenticated
          ? "/account"
          : "/auth/sign-in",
      request.url,
    ),
  );
}
