import { getViewer } from "./viewer";
export type AppIdentity = {
  userId: string | null;
  isAuthenticated: boolean;
  isPlus: boolean;
};

/**
 * Stable application-facing auth boundary.
 *
 * Game/domain code uses this shape; sessions and subscription entitlement are
 * resolved only by the canonical server viewer.
 */
export async function getIdentity(): Promise<AppIdentity> {
  const viewer = await getViewer();
  return {
    userId: viewer.userId,
    isAuthenticated: viewer.authenticated,
    isPlus: viewer.premium,
  };
}
