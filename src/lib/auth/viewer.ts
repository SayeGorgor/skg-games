import * as Sentry from "@sentry/nextjs";
import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { auth } from "./server";
import { getDb } from "@/lib/db";
import { subscriptions, userProfiles } from "@/lib/db/schema";
import { hasPremiumSubscription } from "./flow";

export type Viewer = {
  userId: string | null;
  email: string | null;
  name: string | null;
  authenticated: boolean;
  premium: boolean;
};
export async function ensureProfileForAuthUser(user: {
  id: string;
  name?: string | null;
}) {
  const db = getDb();
  if (!db) return;
  await db
    .insert(userProfiles)
    .values({ userId: user.id, displayName: user.name?.slice(0, 120) || null })
    .onConflictDoNothing();
}
export async function getPremiumEntitlement(userId: string) {
  const db = getDb();
  if (!db) return false;
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return hasPremiumSubscription(subscription);
}
export const getViewer = cache(async (): Promise<Viewer> => {
  const empty: Viewer = {
    userId: null,
    email: null,
    name: null,
    authenticated: false,
    premium: false,
  };
  if (!auth) return empty;
  const response = await auth.getSession().catch(() => {
    Sentry.logger.error("Session lookup failed", {
      operation: "get_session",
      feature: "auth",
      outcome: "unexpected_failure",
    });
    return null;
  });
  if (response?.error) {
    Sentry.logger.warn("Session lookup returned an error", {
      operation: "get_session",
      feature: "auth",
      outcome: "failure",
    });
  }
  if (!response?.data?.user) return empty;

  const session = response.data;

  const user = session.user;
  let premium = false;
  try {
    await ensureProfileForAuthUser(user);
    premium = await getPremiumEntitlement(user.id);
  } catch {
    Sentry.logger.error("Account entitlement lookup failed", {
      operation: "get_entitlement",
      feature: "auth",
      outcome: "unexpected_failure",
    });
    /* Fail closed on entitlement; free play survives a database outage. */
  }
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    authenticated: true,
    premium,
  };
});
