// Intentionally invoked ONLY by admin:bootstrap-owner, never build/start/routes.
import { runOwnerBootstrapCli } from "./lib/owner-bootstrap-cli";

void runOwnerBootstrapCli(
  process.argv.slice(2),
  process.env,
  {
    out: (message) => process.stdout.write(`${message}\n`),
    error: (message) => process.stderr.write(`${message}\n`),
  },
  async (connectionString) => {
    // Node 22+ has native WebSocket; no extra dependency or HTTP transactions.
    if (typeof globalThis.WebSocket !== "function")
      throw new Error("Native WebSocket required");
    const { Client, neonConfig } = await import("@neondatabase/serverless");
    neonConfig.webSocketConstructor = globalThis.WebSocket;
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 10000,
    });
    // Prevent asynchronous driver errors from printing sensitive raw failures.
    client.on("error", () => {});
    return {
      connect: async () => {
        await client.connect();
      },
      query: async (text, values) => {
        const result = await client.query(text, values);
        return { rows: result.rows };
      },
      end: async () => {
        await client.end();
      },
    };
  },
)
  .then((code) => {
    process.exitCode = code;
  })
  .catch(() => {
    process.stderr.write(
      "Bootstrap failed; no success confirmed. Check restricted database state before any retry.\n",
    );
    process.exitCode = 1;
  });
