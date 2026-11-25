import { Client, neonConfig } from "@neondatabase/serverless";
import { verifyRoleWriter } from "./lib/role-writer-verification";
import { approvedDbTarget } from "./lib/db-target";

async function main() {
  const target = approvedDbTarget(process.env, "ROLE_WRITER_VERIFY");
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const db = new Client({
    connectionString: target.url,
    connectionTimeoutMillis: 10000,
  });
  db.on("error", () => {});
  try {
    await db.connect();
    const checks = await verifyRoleWriter(db, target.database);
    for (const { check, passed } of checks) {
      console.log(`${passed ? "PASS" : "FAIL"}: ${check}`);
      if (!passed) process.exitCode = 1;
    }
  } finally {
    await db.end();
  }
}
void main().catch(() => {
  console.error(
    "Writer verification refused or failed; inspect the approved target privately.",
  );
  process.exitCode = 1;
});
