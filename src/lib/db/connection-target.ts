/** Compare declared connection identity without returning or logging diagnostics. */
export function matchesDatabaseUrl(
  url: string,
  host: string,
  database: string,
  role: string,
): boolean {
  try {
    const parsed = new URL(url);
    const keys = [...parsed.searchParams.keys()];
    return (
      ["postgres:", "postgresql:"].includes(parsed.protocol) &&
      !parsed.hash &&
      (parsed.port === "" || parsed.port === "5432") &&
      parsed.hostname === host &&
      decodeURIComponent(parsed.pathname.slice(1)) === database &&
      decodeURIComponent(parsed.username) === role &&
      !!parsed.password &&
      /^[a-zA-Z0-9_.-]+$/.test(host) &&
      /^[a-zA-Z0-9_-]+$/.test(database) &&
      /^[a-zA-Z0-9_-]+$/.test(role) &&
      ["require", "verify-full"].includes(
        parsed.searchParams.get("sslmode") ?? "",
      ) &&
      new Set(keys).size === keys.length &&
      keys.every((key) => ["sslmode", "channel_binding"].includes(key))
    );
  } catch {
    return false;
  }
}
