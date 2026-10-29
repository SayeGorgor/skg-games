import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { premiumDestination } from "@/lib/auth/flow";
// Checkout is not connected yet. Never activate subscriptions here.
export async function GET(request: Request) {
  const viewer = await getViewer();
  return NextResponse.redirect(
    new URL(
      premiumDestination(viewer.authenticated, viewer.premium),
      request.url,
    ),
  );
}
