# Daily Perfect Stack account synchronization

The original cross-device bug was a read-path mismatch. New completion requests already sent final placements to the existing `game_attempts.result` JSONB field. Stats read account attempts from Neon, while Perfect Stack initialized exclusively from the unscoped `skg-stack-progress-v2` browser store. A second device could see its statistics but had no board snapshot to initialize.

## Storage and server verification

There is no schema change or migration. New completions still use `POST /api/games/complete`; score, duration, stars, timestamp, seed, variant, challenge reference and placements are stored in the same attempt row. The server loads the authoritative Daily puzzle and verifies piece membership, uniqueness, exact permitted orientation, anchors, occupied cells, bounds, overlaps and complete coverage. The shared pure placement validator accepts the two established anchor encodings: solver bounding-box origins and live pointer anchors. It does not accept arbitrary rotated congruence as proof of a particular saved orientation.

`GET /api/games/perfect-stack/daily-progress?date=YYYY-MM-DD` derives the user solely from the existing Neon Auth session, rejects other query parameters and future dates, and returns all three difficulties together with `Cache-Control: private, no-store` and `Vary: Cookie`. It requires no premium entitlement. Server database queries and account selection remain outside the browser bundle. Dates use the existing New York game calendar and persisted puzzle seeds, never a browser-local day or environment-specific identifier.

The progress reader and Stats use the same completed account attempts. When older duplicate runs exist, both select the fewest moves, then earliest original completion timestamp, then event identity as a deterministic tie break. Practice and other games are excluded from Daily restoration. A malformed or mismatched snapshot remains an official completion but is presented as a legacy result rather than an invented arrangement.

## Loading, reconciliation and account isolation

`PerfectStackGame` waits for authenticated Daily progress before mounting its playable session. Loading and unknown/error states have no board mutations, timer or submission. The endpoint fetches all difficulties in one response. A short, account/date-scoped in-memory cache avoids repeated requests on difficulty navigation; focus, online and results-synced events refresh the account view. Initial failures show Retry. A previously validated, account-scoped completed snapshot can be shown read-only while offline, with a cached-result notice and retry control. Incomplete cached state never turns a failed lookup into permission to play.

Server results override local results and restore the existing solved board, original moves, duration and stars. Remote restoration does not submit a completion, restart a timer or open a fresh-solve popup. Undo, Clear, rotation, dragging and pickup retain their existing solved guards. A just-solved local result stays mounted when its identical server receipt arrives, so syncing does not dismiss its result dialog.

Anonymous progress keeps the original `skg-stack-progress-v2` storage and remains optional-account gameplay. New signed-in Daily snapshots use `skg-stack-progress-v2:account:<accountKey>`. Confirmed server responses use `skg-stack-account-results-v1:<accountKey>:<date>`. Unfinished Daily Auth handoffs are scoped too. Scope and response identities are checked again after requests, and switching accounts gates/remounts the session. Account A's cache cannot initialize account B. The opaque account key is the existing stable hash of the Auth user ID, not an authentication credential.

Before retrieval the existing trusted result synchronization and anonymous claim flow gets an opportunity to upload pending results. If an account has a valid scoped local final board but the server has no completion, the normal idempotent queue retries it with its original timestamp. Shared anonymous storage is not used as authenticated ownership proof.

## Legacy records and safe backfill

An account completion without placements displays **Completed**, its original available stars/moves/time, and an explanation that the original arrangement is unavailable. It does not show an empty locked board or allow another official solve.

On the original device, an account-scoped snapshot or an account-owned queued result can supply a missing arrangement. The old unscoped board is eligible only when an owned receipt matches its date, difficulty, seed, moves and duration. The existing completion POST validates it again. The writer locates the owned completed Daily row, including legacy rows without a result key, and conditionally fills only missing placements/seed. It preserves the row ID, event, original score, duration, stars and completion timestamp. It never overwrites an existing nonempty snapshot, inserts another official result for that legacy completion, or updates streaks. Concurrent backfills are conditional and idempotent. Unknown provenance, mismatched metadata, missing score/time or corrupt nonempty snapshots remain gracefully legacy rather than being guessed or silently replaced.

## Environment compatibility

The local application reads `DATABASE_URL`, `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` through the existing configuration. This change adds no hardcoded production URL or environment-specific puzzle IDs. Development/production sync is expected only when both intentionally use the same authoritative Neon data and Auth user identities. The deployed environment's configuration was not available to verify, so sharing with production is not assumed. Separate branches or separate Auth identities do not share account progress automatically. No migration or production database operation is required.

## Verification

```bash
npm test
npm run lint
npm run build
npm run test:stack-account
```

The new unit/API/PostgreSQL tests cover serialization, exact placement checks, account/difficulty isolation, no-store responses, unknown-state failures, duplicate receipts, legacy rows with no result key, score-preserving backfill and account-specific local caches. PostgreSQL tests use isolated PGlite databases with all repository migrations applied, not the configured Neon database.

The browser verifier uses two isolated browser contexts at desktop and mobile widths against the running app. It reads the prepared Daily puzzle definitions but mocks account and completion APIs, avoiding artificial Auth users or test writes in Neon. It solves Small/Medium through real gameplay, compares exact restored placements and frozen metadata on mobile, verifies Hard remains playable, verifies no restoration POST, switches accounts, checks legacy/backfill behavior and exercises error/offline states. This is browser-based mobile emulation; no physical phone or live signed-in production session is claimed.
