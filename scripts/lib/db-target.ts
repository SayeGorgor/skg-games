// Never loads dotenv, uses DATABASE_URL, or includes secrets in errors.
export function approvedDbTarget(
  env: Readonly<Record<string, string | undefined>>,
  purpose: "MIGRATION" | "VERIFY" | "ROLE_WRITER_VERIFY",
) {
  if (env.NODE_ENV === "production")
    throw new Error(
      "Development-only database tooling refuses production mode.",
    );
  const prefix =
    purpose === "MIGRATION"
      ? "SKG_MIGRATION"
      : purpose === "VERIFY"
        ? "SKG_DB_VERIFY"
        : "SKG_ROLE_WRITER_VERIFY";
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
  try {
    const parsed = new URL(url);
    if (
      !["postgres:", "postgresql:"].includes(parsed.protocol) ||
      parsed.hash ||
      (parsed.port !== "" && parsed.port !== "5432") ||
      parsed.hostname !== host ||
      decodeURIComponent(parsed.pathname.slice(1)) !== database ||
      decodeURIComponent(parsed.username) !== role ||
      !parsed.password ||
      !/^[a-zA-Z0-9_.-]+$/.test(host) ||
      !/^[a-zA-Z0-9_-]+$/.test(database) ||
      !/^[a-zA-Z0-9_-]+$/.test(role) ||
      !["require", "verify-full"].includes(
        parsed.searchParams.get("sslmode") ?? "",
      ) ||
      new Set(parsed.searchParams.keys()).size !==
        [...parsed.searchParams.keys()].length ||
      [...parsed.searchParams.keys()].some(
        (key) => !["sslmode", "channel_binding"].includes(key),
      )
    )
      throw new Error();
  } catch {
    throw new Error(
      "Database target does not match the explicit approved target.",
    );
  }
  if (purpose === "VERIFY" && role !== "skg_app")
    throw new Error("Verification requires skg_app.");
  if (purpose === "ROLE_WRITER_VERIFY" && role !== "skg_role_writer")
    throw new Error("Verification requires skg_role_writer.");
  if (purpose === "MIGRATION" && role === "skg_app")
    throw new Error("Migration requires a separate operator identity.");
  return { url, host, database, role };
}
