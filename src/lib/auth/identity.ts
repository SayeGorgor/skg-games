export type AppIdentity = {
  userId: string | null;
  isAuthenticated: boolean;
  isPlus: boolean;
};

/**
 * Stable application-facing auth boundary.
 *
 * Keep game/domain code dependent on this shape, not on a vendor SDK. When
 * Neon Auth is enabled, implement this function with createNeonAuth() from
 * @neondatabase/auth/next/server and resolve subscription entitlement from DB.
 */
export async function getIdentity(): Promise<AppIdentity> {
  return { userId: null, isAuthenticated: false, isPlus: false };
}
