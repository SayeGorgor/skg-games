# Game statistics and history

`/stats` is public: guests see results saved in this browser, while authenticated
players see their own account history. The header Stats link and Account page link
both lead here. The header streak now uses actual saved daily results.

## Architecture

- Extend `game_attempts`; do not replace attempts, profiles, claims, subscriptions,
  or existing puzzle storage. `user_game_stats` remains a legacy/reserved aggregate
  table. Statistics derive from individual completed attempts, not stale counters.
- New nullable `client_event_id`, `result_key`, and `challenge_date` columns allow
  old rows to remain intact. `verified` defaults to false for existing records.
- Unique event IDs make replayed requests idempotent across accounts. A separate
  `(user_id, result_key)` unique index prevents two events counting the same daily
  puzzle/difficulty. Practice keys use event IDs so distinct sessions remain distinct.
- Existing challenge foreign keys remain in place. Auth IDs continue to be stored
  without foreign keys into Neon's managed authentication schema, as elsewhere in SKG.
- `/api/games/complete` now accepts only authenticated result envelopes. Guest games
  queue locally rather than issuing anonymous database writes. The server determines
  identity from `getViewer()`, requires a same-origin POST, validates/bounds the
  payload, strips unknown metadata, and verifies the opaque account scope matches
  the active session. No client user ID is accepted as authority.
- Daily Stack submissions load the puzzle for its original date, supporting delayed
  offline uploads after midnight. Practice reuses seeded generation. Board geometry
  and stars are validated/recomputed server-side. Alibi outcomes come from the
  authoritative challenge for the original date, rather than the supplied solved flag.
- Moves and durations are self-reported personal statistics. A validated board or
  accusation is not evidence of a tamper-proof timer or competitive score. Legacy
  Stack metrics without a saved board remain explicitly unverified.
- `/api/stats` requires authentication and scopes its query to that session's user
  ID. It returns private/no-store responses, an account scope, aggregates, and 25
  history rows per page, with an optional game filter. It does not return puzzle
  solutions, email addresses, anonymous IDs, or internal user IDs.

## Browser persistence and synchronization

`src/lib/results/local.ts` adds `skg-results-v1` alongside existing board/progress
keys. Each completed event has a stable UUID, UTC completion timestamp, puzzle
identity, outcome, available moves/time, validated metadata, an owner scope, and a
sync receipt flag. A completed daily puzzle has one local result per difficulty;
Practice can retain multiple finished sessions. Incomplete games are never queued.

`ViewerProvider` scopes writes to the current account and initializes migration.
It synchronizes when a validated authenticated viewer is available, regardless of
whether login used email, Google, email verification, `/auth/complete`, or an
already-active session. Result changes, returning online, focus, and visibility
changes retry pending work; the Stats page also provides Retry sync. Duplicate
in-flight calls within a tab share one promise. Database uniqueness handles repeat
requests, other tabs, and interrupted acknowledgements.

Pending guest records are durably bound to an opaque account scope before upload.
Their existing anonymous identity must pass the existing permanent server-side
claim ownership check. A group belonging to another account is quarantined and
cannot be displayed or uploaded for the wrong account; its rightful owner can
retry later. New authenticated records do not depend on claiming an old guest ID.
Every upload includes the expected account scope, preventing a session/account
switch mid-request from sending the result to the wrong account. The scope is a
hash identifier, not a login credential; all authorization remains session-based.

Legacy database-only guest attempts are also claimed when a session becomes
available, even when the new local queue is empty. Successful claim receipts are
cached per guest group to avoid repeatedly claiming unchanged history.

Successful server receipts mark records synced; local history remains intact.
Failed uploads stay pending. Logout preserves existing game boards and result
records, hides account-owned local history from guests/other accounts, and rotates
the identity for subsequent anonymous play. No tokens or credentials are stored
in result records. The existing authentication completion/legacy claim flow remains.

Blocked/full storage never throws into gameplay. The current tab keeps an in-memory
fallback and Stats displays a warning; browser restarts cannot preserve in-memory
results when persistent storage is unavailable. Upload waits until ownership can be
saved safely. Malformed result entries are ignored, and old game storage is not
rewritten by migration.

## Metrics and historical limitations

- Overall: finished games, distinct games, cases won, and Alibi win rate. Stack
  completions are not included in an Alibi win-rate denominator.
- Alibi: completed cases, wins, win rate, current and longest daily win streaks.
- Stack: completed boards; fewest moves and average time separately by difficulty;
  daily streaks. Practice contributes to completion/move/time history, not streaks.
- Streaks use distinct successful puzzle dates in `America/New_York`; multiple Stack
  difficulties on one day count once. A streak can remain current through yesterday
  while today's game is unplayed; an unsuccessful Alibi accusation breaks it.
- History sorts newest first and displays completion timestamps in the browser's
  local timezone. Puzzle dates remain calendar dates and do not shift with timezone.
- Existing duplicate daily database rows are retained but counted once. The first
  finalized Alibi accusation and best existing Stack attempt are used. Legacy rows
  lacking puzzle dates use available completion dates only for duplicate grouping;
  they do not acquire invented puzzle dates or contribute to daily streaks.
- Dated, fingerprint-compatible old Alibi results retain their actual timestamps.
  Dated old Stack metrics are imported even without boards or seeds; unknown
  completion timestamps remain null and history labels the known puzzle date.
  Undated solved flags, incompatible Alibi fingerprints, and old unsaved Practice
  sessions cannot reconstruct historical records. No completion times are fabricated.
- The server currently reads a user's lightweight completed-result fields to derive
  consistent aggregates and deduplicate legacy rows, then paginates the response.
  Very large accounts may warrant database-side aggregation later; puzzle solutions
  are never loaded for this statistics query.

## Migration and deployment

The generated additive migration is `drizzle/0003_game_history.sql`, with matching
Drizzle snapshot and journal entries. No existing rows are deleted or overwritten.

1. Test on a Neon development branch using the existing `.env.local` configuration.
2. Run `npm run db:migrate` against the intended database **before deploying** the new
   server. No live migration was executed as part of implementation.
3. For an empty database, use the existing catalog/content seed workflow
   (`npm run db:seed`, then `npm run generate:stack-dailies` as appropriate).
   The game catalog must exist for completion writes.
4. Deploy the application, then confirm signup/sign-in, play, sync, and stats on a
   development account before promoting the database/application changes.

## Validation

Implementation verification passed: 77 tests, lint, TypeScript, production build,
the statistics browser script, Alibi persistence checks, Stack persistence checks,
and the full Stack mouse/touch/Practice/Daily browser regression script.

- `npm test`: queue persistence/reload, provider-independent session availability,
  retries, concurrent sync, ownership, logout, migration, UTC/date boundaries,
  metrics, authenticated API access, metadata validation, board validation,
  private pagination, database write/receipt query contracts, and existing tests.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- With the development server running: `npx tsx scripts/verify-stats.ts` checks real
  anonymous Alibi and Stack Practice completions, reload deduplication, 320/390/768/
  1440px layouts in both themes, local filtering/pagination, mocked valid-session
  arrival, upload failure/retry, and cross-account isolation. Set `TEST_BASE_URL`
  to target a different server. Screenshots are saved under `artifacts/stats/`.
- Existing Stack/Alibi browser scripts now check local result persistence instead
  of expecting anonymous POSTs to the authenticated completion endpoint.

Manual deployment checks remain: apply the migration on a Neon development branch,
exercise real PostgreSQL concurrent duplicate submissions/claims, sign in through
real email/password, verification email, and Google flows, confirm cross-device
history, and test offline completion followed by reconnect on a later puzzle date.
Automated API/database-contract tests and mocked OAuth/session checks do not replace
those live provider/database checks.

## File map

New files:

- `src/lib/results/{shared,local,server}.ts`: contracts/metrics, durable queue and
  migration/sync, private account-history reads.
- `src/lib/results/{shared,local,api}.test.ts`, `src/lib/db/attempts.test.ts`:
  focused unit, API integration, and database-contract tests.
- `src/lib/auth/account-key.ts`: opaque account storage scope.
- `src/app/stats/page.tsx`, `src/components/stats-client.tsx`,
  `src/app/api/stats/route.ts`: public page, responsive view, private history API.
- `drizzle/0003_game_history.sql`, `drizzle/meta/0003_snapshot.json`,
  `scripts/verify-stats.ts`, `vitest.config.mts`, and this document.

Updated files:

- `src/lib/db/{schema,attempts}.ts`, `drizzle/meta/_journal.json`.
- `src/lib/client-progress.ts` (safe anonymous-ID access).
- `src/components/games/{alibi-game,perfect-stack-game}.tsx` (completion queues).
- `src/components/auth/{viewer-provider,account-controls}.tsx` (sync and logout).
- `src/app/layout.tsx`, `src/app/api/auth/{viewer,claim-anonymous}/route.ts`,
  `src/app/api/games/complete/route.ts` (scoping and secure persistence).
- `src/components/site-header.tsx`, `src/app/account/page.tsx`,
  `src/app/globals.css` (navigation, real streak, responsive stats styling).
- `scripts/verify-{alibi-persistence,stack-persistence,stack}.ts`.
- README and architecture/database/authentication documentation links.
