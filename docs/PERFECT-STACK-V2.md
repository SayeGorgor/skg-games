# Perfect Stack V2

Use every piece. Fill every square. Small is 5x5 / 5 pentominoes; Medium is 6x6 / 4 pentominoes + 4 tetrominoes; Hard is 8x8 / 4 hexominoes + 4 pentominoes + 5 tetrominoes. Tune `STACK_DIFFICULTIES` centrally.

## Generation and payloads

`perfect-stack.ts` contains browser-safe types, configuration, rotations, projection, validation, namespaces and stars. Server generation lives under `perfect-stack/`: orthogonal growth enumerates connected shapes, canonicalizing only rotations (7/18/60 one-sided shapes). FNV-1a/Mulberry32 chooses distinct shapes deterministically. SHA-256 fingerprints include version, difficulty, dimensions and the sorted rotational shape multiset, independently of colors, order or solution.

The solver precomputes all rotational placements and 64-bit BigInt occupancy masks. Search chooses the uncovered cell with the fewest compatible placements. First-solution search is capped at 12,000 nodes per candidate; solution counting stops at three solutions or 16,000 nodes. Up to 256 deterministic shape selections and 120,000 total first-solution search nodes are allowed; failure returns a controlled generation error. Metrics distinguish an incomplete capped count from an exhaustive count. The score prioritizes piece count/size and considers log search effort and capped solution count; it is an initial heuristic, not a calibrated human difficulty estimate.

Public payloads contain schema/generator version 2, mode, difficulty, seed, date/number (null for Practice), rows/cols, pieces, piece count and optimal placements. Canonical solutions and generation metrics stay server-side. Completion accepts any valid full tiling and recomputes stars on the server.

## Daily preparation

`ps:daily:v2:<date>:<difficulty>:candidate:<0..5>` supplies six candidates. Small/Medium favor lower scores; Hard favors higher scores. Previously reserved fingerprints are rejected; a database unique constraint also prevents duplicate official boards. Each date has one challenge number and three variants.

```
npm run generate:stack-dailies -- --days 30
```

The script requires `DATABASE_URL`, is idempotent, and stores solutions and metrics. It leaves publishing to the existing cron. Configure `PERFECT_STACK_EPOCH_DATE` and `PERFECT_STACK_EPOCH_NUMBER` to match an existing catalog before preparing dates (defaults: October 25, 2026 / #127). Existing challenge rows retain their numbers. A date/number conflict fails instead of silently renumbering.

Database-backed pages read persisted variants and report missing preparation rather than generating official puzzles at request time. Without `DATABASE_URL`, New York's `getGameDate()` supplies deterministic Daily candidates with a bounded nine-board process cache. Different server processes produce identical fallback puzzles.

## Practice

`GET /api/games/perfect-stack/practice?difficulty=hard&seed=EXAMPLE` validates 1-64 alphanumeric, underscore or hyphen characters. Omitted seeds use cryptographic random bytes. The separate `ps:practice:v2:<public-seed>:<difficulty>` namespace never consumes official Daily seeds. Share links carry the public seed; the UI performs generation on the server. A finite generation failure returns HTTP 503 so another seed can be tried.

## Migrations

No migration history existed in the repository. `0000_baseline.sql` captures the original schema; `0001_preserve_stack_v1.sql` renames the original puzzle table to `stack_puzzles_legacy`; `0002_perfect_stack_v2.sql` creates three-variant V2 storage and adds attempt mode, variant, puzzle seed and nullable challenge number. Legacy rows and attempts are preserved.

For a fresh database, use `npm run db:migrate`. For a database already provisioned with `db:push`, first reconcile/baseline the existing schema in Drizzle's migration journal; do not blindly replay the CREATE TABLE baseline over existing tables. Back up existing data and review the SQL before deployment. No live database migration was applied during this implementation. Migration snapshots and journal are committed for future `db:generate` runs.

## Progress and interaction

Daily results are date-scoped and separate per tier. Any one solve counts as overall Daily Stack completion. Practice never writes Daily progress. Alibi retains its existing storage behavior. The undated V1 Stack boolean cannot be reliably migrated to a date, so it is not credited as a current-day V2 solve.

Completed Daily results include the puzzle seed, a deep copy of final placements (including rotations and cells), moves, duration and stars in the existing `skg-stack-progress-v2` store. Returning to a difficulty or refreshing restores only a validated full tiling for the same date, difficulty and seed. The keyed game session initializes from that snapshot before showing the board; its timer and mutations remain frozen. Restoring a result never submits completion again. Legacy metadata and invalid/stale snapshots remain replayable instead of locking an empty board. Practice remains session-only.

Successful placements, including repositioning, add one move. Selection, pickup, rotation, invalid drops and Undo do not add a move; Undo never refunds already committed moves. Reset starts a new run only while unsolved; Undo and Reset are locked after completion in both modes. Separate New Puzzle and difficulty navigation actions remain available. Three stars means exactly one placement per piece; two allows at most max(2, ceil(pieceCount * .25)) extra placements; other complete runs receive one.

The existing Pointer Events pipeline, capture, drag threshold, full-size ghost, tile anchoring, resize observer, colored preview and animation-frame edge scrolling remain in place. Board pieces use the same pipeline and ignore their own old cells for collision testing. An invalid reposition leaves the original placement intact. Tap/keyboard activation picks pieces up and rotates them in the tray. No native HTML drag events were introduced.

## Verification

```
npm test
npm run lint
npm run build
npm run dev
npm run test:stack-browser
npm run test:stack-persistence
```

The browser verifier uses installed Chrome by default; set `CHROME_PATH` and optionally `STACK_TEST_URL` for another environment. Screenshots go to ignored `artifacts/stack/`. It checks all three difficulties at 1440/1024/768/390 widths, full rotated solves, board-sized ghosts, invalid reposition restoration, API seed validation, and mobile touch behavior. Real-device feel and human difficulty calibration remain useful follow-up checks.

The persistence verifier solves Small and Medium, switches between difficulties, refreshes and reopens completed boards, and checks exact board/result restoration, stopped timers, no empty first paint, and no duplicate completion requests. It also checks legacy/corrupt/seed-mismatched results, date isolation and Practice separation.
