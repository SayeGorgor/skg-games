# SKG Games — production starter

A Next.js 16 starter based on the SKG Games Figma/prototype work. It includes:

- SKG Games home hub
- Daily Alibi (playable)
- Perfect Stack (playable, desktop + mobile interaction model)
- Light/dark theme persistence
- Anonymous local progress
- Production-oriented Drizzle/Postgres schema for daily challenges, attempts, streaks, subscriptions, and game-specific content
- Neon serverless database adapter
- Daily publishing cron endpoint
- Integration boundaries for Neon Auth, Stripe, PostHog, Sentry, and ads

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app works without a database by using bundled daily demo content. Add `DATABASE_URL` to begin persisting server-side data.

## Database

Personal game statistics and history are available at `/stats`, including local
guest results and automatic account synchronization. Apply the additive history
migration before deploying this feature. See [game statistics architecture,
migration, and verification](docs/GAME-STATISTICS.md).

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

The schema intentionally stores the Neon Auth user ID as text and does **not** create a foreign key into `neon_auth`, keeping the app schema decoupled from managed auth internals.

## Recommended rollout

1. Keep anonymous play enabled and store immediate progress in localStorage.
2. Enable Neon Postgres and persist completed attempts.
3. Enable Neon Auth and merge anonymous progress at sign-in.
4. Add Stripe Checkout + webhook-based subscription state.
5. Replace ad placeholders with your ad provider after traffic/content policy review.
6. Add PostHog + Sentry once deploying public traffic.

## Daily publishing

`/api/cron/publish-daily` runs at 04:05 and 05:05 UTC. The endpoint is idempotent and evaluates the game date in `America/New_York`, so one run lands just after Eastern midnight across both DST and standard time while the other is a harmless no-op/recheck. Set `CRON_SECRET` and send it as `Authorization: Bearer <secret>` for manual/protected invocation.

## Neon Managed Better Auth

Authentication is optional for all free Daily and Practice games. Enable Managed
Better Auth on the Neon branch, set `NEON_AUTH_BASE_URL` to its Auth URL, and set
`NEON_AUTH_COOKIE_SECRET` to a secure random secret of at least 32 characters
(`openssl rand -base64 32`). Leave both blank for anonymous-only demo mode.

Enable email/password and configure verification/email delivery in Neon. Enable
Google there too: shared Google credentials can be used in development when
allowed by the branch; configure custom production credentials in Neon before
launch. Google's Authorized Redirect URI is exactly
`{NEON_AUTH_BASE_URL}/callback/google`, copied from the branch, not localhost or
the SKG home URL. Neon then uses the application's SDK callback URL to return to
SKG. Allow localhost in development and configure your actual deployed origins
as trusted domains in Neon. Keep Google secrets out of browser environment variables.

Standard new signups receive a dismissible, one-time Plus welcome dialog.
Premium purchase intent survives signup/sign-in and goes directly to the Plus
purchase page. Billing remains disconnected; no payment or entitlement is faked.
Account and purchase actions verify sessions server-side; games remain public.
Existing profile/claim/subscription tables need no migration for this integration.

See [authentication setup, merge rules, and verification](docs/AUTHENTICATION.md).
Run `npm run test:auth-browser` with the development server running for responsive
and mocked-provider checks. Live email and Google flows require the Neon setup
above and manual provider verification.
# Daily Alibi Content & Seeding

The 30-case starter catalog lives in `src/lib/games/daily-alibi/cases/collection.ts`, exported by `catalog.ts`. Each hand-authored story has a permanent `caseId`, four suspects with motives and statements, four clues with stable editorial IDs, exactly one culprit, and a deduction plus three exclusion arguments. The builder supplies existing UI fields; it does not invent plots. Add a new story with a new ID rather than editing a published case. Never recycle an existing ID for a different mystery.

```bash
npm run validate:alibi-cases
npm run validate:alibi-cases -- --report
npm run generate:alibi-dailies -- --dry-run
npm run generate:alibi-dailies -- --status
npm run generate:alibi-dailies
npm run generate:alibi-dailies -- --days 30
npm run generate:alibi-dailies -- --start-date 2026-11-04 --days 14
```

Validation checks structure, public model construction, duplicate IDs/titles and normalized SHA-256 content identities. It cannot prove natural-language logic. Review `docs/DAILY-ALIBI-EDITORIAL-REVIEW.md`, playtest all four accusations, and complete the independent editorial checklist before treating cases as editorially approved. The report contains answers and is an internal developer document, not public game content.

Apply the reviewed additive migration before the first real seed:

```bash
npm run db:migrate
```

Migration `0004_alibi_catalog_identity.sql` adds nullable unique `case_id` and `fingerprint` columns to the existing `alibi_cases` table. Nullable columns preserve legacy content. Existing challenge/date/number constraints, case primary keys and clue/suspect uniqueness remain in use. No Perfect Stack table is altered. The migration is generated, not automatically applied. A dry run/status can inspect the legacy schema before migration.

The CLI loads `.env.local` before loading its database module and uses server-only `DATABASE_URL`; it never prints the connection string. Defaults are today's New York game date and 30 calendar dates including today. Calendar increments use UTC date components anchored at noon, so DST cannot skip or duplicate dates. Numbers continue from the earliest existing Alibi assignment; an empty calendar uses `DAILY_ALIBI_EPOCH_DATE` (default `2026-10-25`) and `DAILY_ALIBI_EPOCH_NUMBER` (default `127`). Keep that convention fixed after first use.

Scheduling sorts unused case IDs, fills only missing dates and preserves every existing assignment. Adding or reordering catalog entries cannot reshuffle stored dates. Previously assigned IDs and fingerprints are reserved across the whole calendar, including legacy content fingerprints reconstructed from stored fields. Insufficient inventory fails before writing; add more reviewed cases rather than repeat a case. An incomplete existing challenge fails with a repair message instead of being overwritten.

Real writes serialize cooperating seeders with a PostgreSQL transaction advisory lock. A fresh statement after acquiring the lock rechecks dates and reserved identities. All challenge, case, clue and suspect writes are one atomic transaction, with database uniqueness as a final safeguard. Concurrent conflicts are replanned up to three times; published rows are never updated. Dry-run and status perform SELECTs only and do not even create a game catalog row. Status reports contiguous coverage from today, the next gap and unused inventory using database results.

The page and authenticated completion verifier both use `getDailyAlibiChallenge`, selecting the date and the `daily-alibi` game from the shared calendar. Future prepared rows have no `publishedAt`; date eligibility in `America/New_York` prevents serving them even if incorrectly stamped early. Once their date arrives they are available without waiting for cron; the existing publisher stamps due rows for operational history. There is no public date override on the page. Server-side historical retrieval supports queued result syncing. Missing production data yields a controlled unavailable screen and an actionable server log, never a random replacement.

For an explicitly opted-in local UI fixture only, set `ALIBI_USE_DEVELOPMENT_FIXTURE=true`. It bypasses database loading with a warning and has no effect in production. Disable it to verify real prepared cases. Do not rely on it for content coverage.

Existing local accusation snapshots and their browser-safe fingerprint remain unchanged. The loaded canonical case reconstructs the original name, correctness and explanation, and a restored result cannot submit a second accusation. Account syncing verifies the submitted suspect and challenge number against the stored case for the submitted date rather than trusting `solved`. Anonymous players retain browser-local results and the existing sign-in association/sync flow; this task does not add an anonymous write endpoint. The current client-rendered result architecture still includes suspect correctness/explanations, as before. They remain discoverable in page data; a server-finalized anonymous accusation protocol with compatible offline restoration is a separate follow-up. New editorial metadata and database solution payloads are not sent to the client.

For production, first confirm the target Neon environment, review and back up according to the deployment process, run the additive migration deliberately, inspect `--dry-run` and `--status`, then run the real seed. Never run a migration or a real seed merely because a production URL exists in `.env.local`. No production cron is deployed by these commands. The reusable planner/store/service in `daily-alibi/` can support an authorized scheduler later.

Tests include an isolated PostgreSQL engine (PGlite, development dependency) which applies all migrations, writes actual seed SQL, checks idempotency and constraints, retrieves today's case, denies tomorrow, and compares Perfect Stack rows before and after. Unit tests cover catalog structure, deterministic fingerprints, DST, exhaustion, dry runs, immutable saved outcomes for all 30 cases and seeded accusation verification. Run `npm test`, `npm run lint`, and `npm run build`. The existing `test:alibi-persistence` and `test:alibi-theme` browser scripts use the legacy development fixture; run a separate development server with the explicit fixture flag and point `STACK_TEST_URL` to it.
