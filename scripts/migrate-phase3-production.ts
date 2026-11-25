import { Client, neonConfig } from "@neondatabase/serverless";
import { applyDrizzlePlan } from "./lib/production-drizzle-session";
import {
  frozenProductionPlan,
  planStart,
  productionTarget,
  runProductionPlan,
} from "./lib/production-migration-runner";

let stage = "operator configuration or frozen checkout";
async function main() {
  const target = productionTarget(process.env, process.argv.slice(2));
  const plan = frozenProductionPlan(target.revision);
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const db = new Client({
    connectionString: target.url,
    connectionTimeoutMillis: 10000,
    query_timeout: 35000,
  });
  db.on("error", () => {});
  try {
    stage = "connection or production checks";
    await db.connect();
    const state = await runProductionPlan(
      db,
      target.mode,
      target,
      plan,
      async () => {
        stage = "transactional apply or postflight";
        await applyDrizzlePlan(db, plan.slice(planStart));
      },
    );
    if (target.mode === "preflight") {
      for (const { folderMillis, hash } of plan.slice(planStart)) {
        console.log(`Reviewed migration ${folderMillis} SHA-256 ${hash}`);
      }
    }
    console.log(
      state === "pending"
        ? "PASS preflight: exact ledger through 0007; 0008 and 0009 pending."
        : "PASS verified ledger through 0009 and expected objects and grants.",
    );
  } finally {
    await db.end();
  }
}
void main().catch(() => {
  console.error(
    `FAIL ${stage}. No automatic retry. Reconcile using a fresh read-only preflight.`,
  );
  process.exitCode = 1;
});
