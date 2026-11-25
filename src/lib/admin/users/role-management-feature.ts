import "server-only";
import { isRoleWriterConfigured } from "./role-writer";

export function isRoleManagementEnabled(): boolean {
  const env = process.env;
  const production =
    env.VERCEL_ENV === "production" ||
    (env.NODE_ENV === "production" && env.VERCEL_ENV !== "preview");
  return (
    env.SKG_RBAC_ROLE_MANAGEMENT_ENABLED === "yes" &&
    (!production ||
      env.SKG_RBAC_ROLE_MANAGEMENT_PRODUCTION_APPROVED === "yes") &&
    isRoleWriterConfigured()
  );
}
