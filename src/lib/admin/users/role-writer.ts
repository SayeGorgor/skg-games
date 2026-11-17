import "server-only";
import { neon } from "@neondatabase/serverless";
import type { AppRole } from "@/lib/auth/permissions";

export type WriterInput = {
  actorId: string;
  targetId: string;
  requestedRole: AppRole;
  expectedRole: AppRole | null;
  expectedRevision: string | null;
};
export type WriterStatus =
  | "success"
  | "forbidden"
  | "stale_state"
  | "not_found"
  | "no_change"
  | "temporarily_unavailable";

// Operator attestation must follow independent branch/endpoint and privilege review.
// The URL's database name or host similarity is not evidence of branch identity.
function writerUrl(env: NodeJS.ProcessEnv): string | null {
  if (env.SKG_RBAC_WRITER_APPROVED_BRANCH !== "yes") return null;
  const url = env.SKG_RBAC_WRITER_DATABASE_URL;
  const runtime = env.DATABASE_URL;
  if (
    !url ||
    !runtime ||
    !env.SKG_RBAC_WRITER_EXPECTED_HOST ||
    !env.SKG_RBAC_RUNTIME_EXPECTED_HOST ||
    !env.SKG_RBAC_EXPECTED_DATABASE
  )
    return null;
  try {
    const w = new URL(url),
      a = new URL(runtime);
    if (
      !["postgres:", "postgresql:"].includes(w.protocol) ||
      !["postgres:", "postgresql:"].includes(a.protocol) ||
      decodeURIComponent(w.username) !== "skg_role_writer" ||
      !w.password ||
      w.hostname !== env.SKG_RBAC_WRITER_EXPECTED_HOST ||
      a.hostname !== env.SKG_RBAC_RUNTIME_EXPECTED_HOST ||
      decodeURIComponent(w.pathname.slice(1)) !==
        env.SKG_RBAC_EXPECTED_DATABASE ||
      decodeURIComponent(a.pathname.slice(1)) !==
        env.SKG_RBAC_EXPECTED_DATABASE ||
      w.searchParams.get("sslmode") !== "require" ||
      w.hash ||
      a.hash
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

export async function writeApplicationRole(
  input: WriterInput,
): Promise<WriterStatus> {
  const url = writerUrl(process.env);
  if (!url) return "temporarily_unavailable";
  try {
    const sql = neon(url, {
      fetchOptions: { signal: AbortSignal.timeout(10000) },
    });
    const rows = await sql.query(
      "SELECT skg_private.assign_application_role($1,$2,$3,$4,$5::bigint) AS status",
      [
        input.actorId,
        input.targetId,
        input.requestedRole,
        input.expectedRole,
        input.expectedRevision,
      ],
    );
    const status = rows[0]?.status;
    return [
      "success",
      "forbidden",
      "stale_state",
      "not_found",
      "no_change",
    ].includes(status)
      ? (status as WriterStatus)
      : "temporarily_unavailable";
  } catch {
    // An abort/network error may occur after commit. Never retry automatically.
    return "temporarily_unavailable";
  }
}
