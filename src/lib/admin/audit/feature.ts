import "server-only";

export function auditHistoryEnabled(env = process.env): boolean {
  const production =
    env.VERCEL_ENV === "production" ||
    (env.NODE_ENV === "production" && env.VERCEL_ENV !== "preview");
  return (
    env.SKG_AUDIT_HISTORY_ENABLED === "yes" &&
    (!production || env.SKG_AUDIT_HISTORY_PRODUCTION_APPROVED === "yes")
  );
}
