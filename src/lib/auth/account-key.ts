import { createHash } from "node:crypto";

// A stable, opaque browser-storage scope. This is not a credential or entitlement.
export function accountKey(userId: string) {
  return createHash("sha256").update(`skg-results:${userId}`).digest("hex");
}
