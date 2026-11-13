import { createHash } from "node:crypto";

const messages = {
  arguments: "Missing, invalid, duplicate or ambiguous bootstrap arguments.",
  connection:
    "An explicit bootstrap connection is required; DATABASE_URL is never used.",
  target: "Database target verification failed.",
  schema:
    "Required role, audit or managed Auth schema is missing or incompatible.",
  owner_exists: "An Owner already exists; initial bootstrap is unavailable.",
  bootstrap_used:
    "An initial bootstrap audit already exists; use a separately reviewed recovery procedure.",
  auth_user: "The explicitly selected Auth user does not exist.",
  privileged_target:
    "The selected identity has an unexpected privileged assignment.",
  approval: "Target-specific execution approval is required.",
  production_approval: "Additional production-specific approval is required.",
  database:
    "Bootstrap database operation failed; no success is confirmed. Inspect restricted database state before any further action.",
} as const;
export class OwnerBootstrapError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
  }
}
export function safeBootstrapError(error: unknown): string {
  return error instanceof OwnerBootstrapError &&
    Object.hasOwn(messages, error.code)
    ? messages[error.code]
    : messages.database;
}
export type BootstrapOptions = Readonly<{
  execute: boolean;
  userId: string;
  environment: "development" | "preview" | "production";
  projectId: string;
  branchId: string;
  expectedHost: string;
  expectedDatabase: string;
  operatorReference: string;
  consoleVerified: true;
  confirmation?: string;
  productionConfirmation?: string;
}>;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const reference = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;
export function parseBootstrapOptions(
  args: readonly string[],
): BootstrapOptions {
  const flags = new Map<string, string>();
  const boolean = new Set(["--execute", "--dry-run", "--console-verified"]);
  const names = new Set([
    ...boolean,
    "--user-id",
    "--environment",
    "--project-id",
    "--branch-id",
    "--expected-host",
    "--expected-database",
    "--operator-reference",
    "--confirm",
    "--confirm-production",
  ]);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!names.has(key) || flags.has(key))
      throw new OwnerBootstrapError("arguments");
    const value = boolean.has(key) ? "true" : args[++i];
    if (!value || value.startsWith("--"))
      throw new OwnerBootstrapError("arguments");
    flags.set(key, value);
  }
  const option = {
    execute: flags.has("--execute"),
    userId: flags.get("--user-id") ?? "",
    environment: flags.get("--environment") ?? "",
    projectId: flags.get("--project-id") ?? "",
    branchId: flags.get("--branch-id") ?? "",
    expectedHost: flags.get("--expected-host") ?? "",
    expectedDatabase: flags.get("--expected-database") ?? "",
    operatorReference: flags.get("--operator-reference") ?? "",
    consoleVerified: flags.has("--console-verified"),
    confirmation: flags.get("--confirm"),
    productionConfirmation: flags.get("--confirm-production"),
  };
  if (
    (flags.has("--execute") && flags.has("--dry-run")) ||
    !uuid.test(option.userId) ||
    !["development", "preview", "production"].includes(option.environment) ||
    !/^[a-z][a-z0-9-]{2,79}$/.test(option.projectId) ||
    !/^br-[a-z0-9-]{3,77}$/.test(option.branchId) ||
    !/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(option.expectedHost) ||
    !/^[A-Za-z0-9_][A-Za-z0-9_-]{0,62}$/.test(option.expectedDatabase) ||
    !reference.test(option.operatorReference) ||
    !option.consoleVerified
  )
    throw new OwnerBootstrapError("arguments");
  return Object.freeze(option as BootstrapOptions);
}
export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
/** Deliberate acknowledgment, not a credential or proof of independent review. */
export function bootstrapConfirmation(options: BootstrapOptions): string {
  return fingerprint(
    JSON.stringify([
      "skg-owner-bootstrap-v1",
      options.userId,
      options.environment,
      options.projectId,
      options.branchId,
      options.expectedHost,
      options.expectedDatabase,
      options.operatorReference,
    ]),
  );
}
export function verifyExecutionApproval(options: BootstrapOptions): void {
  if (!options.execute) return;
  const token = bootstrapConfirmation(options);
  if (options.confirmation !== token) throw new OwnerBootstrapError("approval");
  if (
    options.environment === "production" &&
    options.productionConfirmation !== `PRODUCTION:${token}`
  )
    throw new OwnerBootstrapError("production_approval");
}
export function bootstrapConnection(
  env: Readonly<Record<string, string | undefined>>,
  options: BootstrapOptions,
): string {
  const connection = env.SKG_RBAC_BOOTSTRAP_DATABASE_URL;
  if (!connection) throw new OwnerBootstrapError("connection");
  try {
    const url = new URL(connection);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.username ||
      !url.password ||
      url.hostname !== options.expectedHost ||
      (url.port && url.port !== "5432") ||
      decodeURIComponent(url.pathname) !== `/${options.expectedDatabase}` ||
      url.hash ||
      [...url.searchParams.keys()].some(
        (key) => !["sslmode", "channel_binding"].includes(key),
      ) ||
      (url.searchParams.has("sslmode") &&
        !["require", "verify-full"].includes(
          url.searchParams.get("sslmode")!,
        )) ||
      (url.searchParams.has("channel_binding") &&
        !["require", "prefer"].includes(
          url.searchParams.get("channel_binding")!,
        ))
    )
      throw new OwnerBootstrapError("target");
    if (
      new Set(url.searchParams.keys()).size !==
      [...url.searchParams.keys()].length
    )
      throw new OwnerBootstrapError("target");
    return connection;
  } catch {
    throw new OwnerBootstrapError("target");
  }
}
