# Database model

## Catalog and publishing

- `games`: one row per game (`daily-alibi`, `perfect-stack`).
- `daily_challenges`: date/number/publish state plus generic public and private solution payloads.
- `alibi_cases`, `alibi_clues`, `alibi_suspects`: normalized Daily Alibi authoring data.
- `stack_puzzles`: Perfect Stack board/pieces/target/solution.
- `publish_runs`: audit trail for the daily publisher.

## Player state

- `game_attempts`: immutable-ish completion/attempt event records.
- `user_game_stats`: aggregate streak and solve counters for fast profile reads.
- `user_profiles`: SKG-owned profile/preferences keyed by the managed auth user id.
- `anonymous_claims`: records ownership when local anonymous progress is merged into an account.

## Monetization

- `subscriptions`: Stripe identifiers and entitlement state. Never trust the browser for Plus status.
- `ad_placements`: enables/disables named ad slots by game/format without a code deploy.

## Why no FK to Neon Auth?

Managed authentication owns the `neon_auth` schema. SKG stores the auth user id as text and joins logically at the application/query layer rather than coupling migrations to managed auth internals.
