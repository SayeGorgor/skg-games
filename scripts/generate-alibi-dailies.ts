import { config } from "dotenv";
import { getGameDate } from "../src/lib/game-date";
import {
  addCalendarDays,
  calendarDate,
  alibiCoverage,
} from "../src/lib/games/daily-alibi/scheduling";
import { alibiCatalog } from "../src/lib/games/daily-alibi/catalog";
import { validateAlibiCatalog } from "../src/lib/games/daily-alibi/validation";

async function main() {
  config({ path: ".env.local", quiet: true });
  const args = process.argv.slice(2);
  let start = getGameDate(),
    days = 30,
    dryRun = false,
    status = false;
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--start-date":
        start = calendarDate(args[++i] ?? "");
        break;
      case "--days":
        days = Number(args[++i]);
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--status":
        status = true;
        break;
      default:
        throw new Error(`Unknown option: ${args[i]}`);
    }
  }
  if (!Number.isInteger(days) || days < 1 || days > 366)
    throw new Error("--days must be 1–366");
  const errors = validateAlibiCatalog(alibiCatalog);
  if (errors.length) throw new Error(JSON.stringify(errors, null, 2));
  // Environment initialization precedes loading database code.
  const { createAlibiSeedStore, requireAlibiDatabaseUrl, seedAlibiDailies } =
    await import("../src/lib/games/daily-alibi/seeding");
  const store = createAlibiSeedStore(requireAlibiDatabaseUrl());
  if (status) {
    console.log(
      JSON.stringify(alibiCoverage(alibiCatalog, await store.read()), null, 2),
    );
    return;
  }
  const result = await seedAlibiDailies(store, alibiCatalog, {
    start,
    days,
    dryRun,
  });
  console.log(
    `Daily Alibi — Seed Summary\nEnvironment: ${process.env.NODE_ENV ?? "development"}\nDatabase: connected\nTimezone: America/New_York\nStart: ${start}\nEnd: ${addCalendarDays(start, days - 1)}\nCases structurally validated: ${alibiCatalog.length}\nExisting dates skipped: ${result.skipped}\nNew cases inserted: ${result.inserted}\nPlanned: ${result.planned.length}\nDry run: ${dryRun}\nErrors: 0`,
  );
  if (dryRun)
    for (const p of result.planned)
      console.log(p.challengeDate, p.challengeNumber, p.entry.caseId);
}
void main().catch((error) => {
  // Database driver errors can include connection details. Only known local
  // validation errors are safe to print verbatim.
  const message = error instanceof Error ? error.message : "Unknown error";
  const safe =
    /^(DATABASE_URL|Cannot prepare|Existing Daily|Invalid calendar|--days|Unknown option|Challenge numbering|Concurrent Daily|\[\{)/.test(
      message,
    );
  console.error(
    `Daily Alibi seeding failed:\n${safe ? message : "Database operation failed. Check connectivity and apply db:migrate; no existing case is overwritten."}`,
  );
  process.exitCode = 1;
});
