import { approvedDbTarget } from "./db-target";
export async function runApprovedMigrations(
  env: Readonly<Record<string, string | undefined>>,
  connect: (url: string) => {
    identity(): Promise<{ db: unknown; role: unknown; session: unknown }>;
    migrate(): Promise<void>;
  },
) {
  const target = approvedDbTarget(env, "MIGRATION");
  const connection = connect(target.url);
  const identity = await connection.identity();
  if (
    identity.db !== target.database ||
    identity.role !== target.role ||
    identity.session !== target.role
  )
    throw new Error("Migration server identity mismatch.");
  await connection.migrate();
}
