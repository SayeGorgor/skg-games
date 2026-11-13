// CLI orchestration only. No dotenv or application DB/Sentry imports.
import { bootstrapOwner, type BootstrapSql } from "./owner-bootstrap";
import {
  bootstrapConnection,
  bootstrapConfirmation,
  fingerprint,
  parseBootstrapOptions,
  safeBootstrapError,
  verifyExecutionApproval,
} from "./owner-bootstrap-options";
export const bootstrapUsage = `Owner bootstrap (operator terminal only; default is READ-ONLY).
Required: --user-id UUID --environment development|preview|production
  --project-id PROJECT --branch-id br-BRANCH --expected-host HOST
  --expected-database DATABASE --operator-reference OPERATOR_REF --console-verified
Connection: explicitly set SKG_RBAC_BOOTSTRAP_DATABASE_URL in your process environment.
Never falls back to DATABASE_URL and never loads .env.local.
Dry run: omit --execute, or supply --dry-run. Independently verify project/branch in Neon Console.
Execute: add --execute --confirm TOKEN_FROM_DRY_RUN.
Production also requires --confirm-production PRODUCTION:TOKEN_FROM_DRY_RUN.
Do not share terminal output or use email/credentials as operator reference.`;
export type BootstrapClient = BootstrapSql & {
  connect(): Promise<void>;
  end(): Promise<void>;
};
type BootstrapIo = { out(message: string): void; error(message: string): void };
export async function runOwnerBootstrapCli(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  io: BootstrapIo,
  createClient: (connection: string) => Promise<BootstrapClient>,
): Promise<number> {
  if (args.length === 1 && args[0] === "--help") {
    io.out(bootstrapUsage);
    return 0;
  }
  let client: BootstrapClient | undefined;
  let result = 1;
  try {
    const options = parseBootstrapOptions(args);
    const connection = bootstrapConnection(env, options);
    verifyExecutionApproval(options);
    client = await createClient(connection);
    await client.connect();
    // Both modes preflight inside their transaction, not from an earlier dry-run.
    const preflight = await bootstrapOwner(client, options);
    io.out(
      `Database verified: ${preflight.database}; database-role fingerprint: ${preflight.databaseRoleFingerprint}; host fingerprint: ${fingerprint(options.expectedHost).slice(0, 12)}.`,
    );
    io.out(
      "Project/branch verification: operator Console attestation only; NOT verified via Neon API. This check cannot prove branch identity.",
    );
    if (options.execute)
      io.out(
        "Owner bootstrap committed: one role assignment and one audit record. Verify intended-environment access independently.",
      );
    else {
      io.out(
        `READ-ONLY preflight passed. Previous assignment: ${preflight.previousRole ?? "none (effective player)"}. Execution would assign Owner and insert one audit record; no profile/Auth changes.`,
      );
      io.out(`Target-specific confirmation: ${bootstrapConfirmation(options)}`);
    }
    result = 0;
  } catch (error) {
    io.error(safeBootstrapError(error));
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        io.error(
          "Connection closure failed. Do not retry automatically; verify restricted database state.",
        );
        result = 1;
      }
    }
  }
  return result;
}
