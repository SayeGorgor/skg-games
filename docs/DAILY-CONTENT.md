# Daily content and preparation

Daily Alibi uses an authored, structurally validated catalog and persisted calendar assignments, not request-time mystery prose generation. The calendar is `America/New_York`; puzzle dates remain stable across daylight saving changes. Catalog IDs/fingerprints reserve assignments so preparation skips existing dates rather than rewriting published cases.

See [scheduling/seeding source](../src/lib/games/daily-alibi/), [database design](DATABASE.md), [editorial case review](DAILY-ALIBI-EDITORIAL-REVIEW.md) and [persistence](DAILY-ALIBI-PERSISTENCE.md). Structural checks do not replace human editorial sign-off; editorial records contain solution spoilers. The bundled fixture is an explicit non-production fallback.

For an approved development target, review migrations before preparing content. `npm run validate:alibi-cases` validates the catalog. `npm run generate:alibi-dailies -- --start-date YYYY-MM-DD --days 30 --dry-run` plans assignments while reading the configured database; `--status` reads coverage. Without `--dry-run`, it writes new assignments. These database operations were not run during consolidation; choose the target deliberately. Never replay migrations or overwrite published cases to resolve a missing date.

Perfect Stack uses deterministic seeded shape selection, bounded solver search, rotational canonicalization and fingerprints. [Perfect Stack V2](PERFECT-STACK-V2.md) preserves generation budgets, payload boundaries and full-tiling verification; canonical solutions stay server-side. `npm run generate:stack-dailies` prepares Daily puzzles; inspect the script and target before writes.

The protected publisher is idempotent and uses the shared calendar. Hosting configuration determines actual scheduling; a cron route does not prove invocation is configured. [Game statistics](GAME-STATISTICS.md) covers account results and delayed uploads.
