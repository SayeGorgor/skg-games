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

## Neon Auth note

As of this starter's creation, the current Neon Auth Next.js SDK is beta. The project therefore keeps app identity in `src/lib/auth/identity.ts` behind a stable interface. When you enable Neon Auth, wire that adapter to `@neondatabase/auth/next/server` rather than importing the SDK throughout game code.
