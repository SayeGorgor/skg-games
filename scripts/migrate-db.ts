import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { runApprovedMigrations } from "./lib/migration-runner";
// Explicit development-only command; never imported by app/build/startup.
async function main() {
  await runApprovedMigrations(process.env, (url) => {
    const sql = neon(url);
    return {
      async identity() {
        const [identity] =
          await sql`SELECT current_database() AS db, current_user AS role, session_user AS session`;
        return {
          db: identity?.db,
          role: identity?.role,
          session: identity?.session,
        };
      },
      async migrate() {
        await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
      },
    };
  });
  console.log("Approved development migrations completed.");
}
void main().catch(() => {
  console.error(
    "Migration refused or failed. Check approved development target and migration state privately; no automatic retry.",
  );
  process.exitCode = 1;
});
