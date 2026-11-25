import type { Client } from "@neondatabase/serverless";
import { NeonSession, NeonTransaction } from "drizzle-orm/neon-serverless";
import { PgDialect } from "drizzle-orm/pg-core";
import type { MigrationMeta } from "drizzle-orm/migrator";

type Empty = Record<string, never>;

// The runner owns the outer transaction. Drizzle owns migration SQL and ledger
// recording, using a savepoint inside that same transaction on the same client.
class ProductionSession extends NeonSession<Empty, Empty> {
  override transaction<T>(
    run: (tx: NeonTransaction<Empty, Empty>) => Promise<T>,
  ): Promise<T> {
    return new NeonTransaction<Empty, Empty>(
      this.dialect,
      this,
      undefined,
    ).transaction(run);
  }
}

export async function applyDrizzlePlan(
  client: Client,
  migrations: MigrationMeta[],
) {
  const dialect = new PgDialect();
  await dialect.migrate(
    migrations,
    new ProductionSession(client, dialect, undefined),
    { migrationsFolder: "drizzle" },
  );
}
