import "server-only";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { userRoles } from "@/lib/db/schema";
import { getViewer } from "./viewer";
import {
  hasPermission,
  isAppRole,
  type AppRole,
  type AppPermission,
} from "./permissions";

/** For trusted server callers only. Never use a request-supplied ID to authorize
 * the current request. No persistent cache: downgrades apply on the next lookup.
 */
export async function getRoleForUser(userId: string): Promise<AppRole> {
  try {
    if (typeof userId !== "string" || !userId) return "player";
    const db = getDb();
    if (!db) return "player";
    const [row] = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId))
      .limit(1);
    return isAppRole(row?.role) ? row.role : "player";
  } catch {
    // Deny elevation without exposing errors, IDs, roles or query parameters.
    return "player";
  }
}
export async function getCurrentUserRole(): Promise<AppRole> {
  try {
    const viewer = await getViewer();
    if (!viewer.authenticated || !viewer.userId) return "player";
    return await getRoleForUser(viewer.userId);
  } catch {
    return "player";
  }
}
export async function requirePermission(
  permission: AppPermission,
): Promise<void> {
  if (!hasPermission(await getCurrentUserRole(), permission)) notFound();
}
