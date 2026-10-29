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