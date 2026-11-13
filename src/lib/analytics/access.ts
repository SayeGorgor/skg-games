import "server-only";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getRoleForUser } from "@/lib/auth/authorization";
import { hasPermission } from "@/lib/auth/permissions";

/** Preserve generic denial at every existing analytics authorization boundary. */
export async function requireAnalyticsAdmin(): Promise<void> {
  let allowed = false;
  try {
    const viewer = await getViewer();
    if (viewer.authenticated && viewer.userId) {
      const role = await getRoleForUser(viewer.userId);
      allowed = hasPermission(role, "analytics:read");
    }
  } catch {
    // Internal session/authorization failures must not disclose details.
  }
  if (!allowed) notFound();
}
