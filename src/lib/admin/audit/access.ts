import "server-only";
import { matchesDatabaseUrl } from "@/lib/db/connection-target";
import { getViewer } from "@/lib/auth/viewer";
import { getRoleForUser } from "@/lib/auth/authorization";
import { hasPermission } from "@/lib/auth/permissions";
import { notFound } from "next/navigation";

export async function requireAuditRead() {
  const viewer = await getViewer(true);
  if (
    !viewer.authenticated ||
    !viewer.userId ||
    !hasPermission(await getRoleForUser(viewer.userId), "audit:read")
  )
    notFound();
}

export function auditReaderUrl(env = process.env): string | null {
  const {
    SKG_AUDIT_READER_DATABASE_URL: url,
    SKG_AUDIT_READER_EXPECTED_HOST: host,
    SKG_AUDIT_RUNTIME_EXPECTED_HOST: runtimeHost,
    SKG_AUDIT_EXPECTED_DATABASE: database,
    DATABASE_URL: runtime,
  } = env;
  if (
    env.SKG_AUDIT_READER_APPROVED_BRANCH !== "yes" ||
    !url ||
    !host ||
    !database ||
    !runtime ||
    !runtimeHost ||
    !matchesDatabaseUrl(url, host, database, "skg_audit_reader") ||
    !matchesDatabaseUrl(runtime, runtimeHost, database, "skg_app")
  )
    return null;
  return url;
}
