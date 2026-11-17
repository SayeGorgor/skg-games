import { Client, neonConfig } from "@neondatabase/serverless";
import { approvedDbTarget } from "./lib/db-target";
import { verifyRuntime } from "./lib/runtime-verification";
async function main() {
  const target = approvedDbTarget(process.env, "VERIFY");
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const client = new Client({
    connectionString: target.url,
    connectionTimeoutMillis: 10000,
  });
  client.on("error", () => {});
  try {
    await client.connect();
    await client.query("SET statement_timeout='10s'; SET lock_timeout='2s'");
    const checks = await verifyRuntime(client, target.database);
    for (const item of checks)
      console.log(`${item.passed ? "PASS" : "FAIL"}: ${item.check}`);
    if (checks.some((item) => !item.passed)) process.exitCode = 1;
  } finally {
    await client.end();
  }
}
void main().catch(() => {
  console.error(
    "Privilege verification refused or failed. Review approved isolated target privately; no raw diagnostics logged.",
  );
  process.exitCode = 1;
});
