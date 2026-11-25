import { matchesDatabaseUrl } from "../../src/lib/db/connection-target";

// Never loads dotenv, uses DATABASE_URL, or includes secrets in errors.
export function approvedDbTarget(
  env: Readonly<Record<string, string | undefined>>,
  purpose:
    "MIGRATION" | "VERIFY" | "ROLE_WRITER_VERIFY" | "AUDIT_READER_VERIFY",
) {
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production")
    throw new Error(
      "Development-only database tooling refuses production mode.",
    );
  const prefix =
    purpose === "MIGRATION"
      ? "SKG_MIGRATION"
      : purpose === "VERIFY"
        ? "SKG_DB_VERIFY"
        : "SKG_" + purpose;
  const url = env[`${prefix}_DATABASE_URL`],
    host = env[`${prefix}_EXPECTED_HOST`],
    database = env[`${prefix}_EXPECTED_DATABASE`],
    role = env[`${prefix}_EXPECTED_ROLE`];
  if (
    env[`${prefix}_APPROVED_ISOLATED_BRANCH`] !== "yes" ||
    !url ||
    !host ||
    !database ||
    !role
  )
    throw new Error(
      "Explicit isolated-development approval, connection and expected target are required.",
    );
  if (!matchesDatabaseUrl(url, host, database, role))
    throw new Error(
      "Database target does not match the explicit approved target.",
    );
  if (purpose === "VERIFY" && role !== "skg_app")
    throw new Error("Verification requires skg_app.");
  if (purpose === "ROLE_WRITER_VERIFY" && role !== "skg_role_writer")
    throw new Error("Verification requires skg_role_writer.");
  if (purpose === "AUDIT_READER_VERIFY" && role !== "skg_audit_reader")
    throw new Error("Verification requires skg_audit_reader.");
  if (purpose === "MIGRATION" && role === "skg_app")
    throw new Error("Migration requires a separate operator identity.");
  return { url, host, database, role };
}
