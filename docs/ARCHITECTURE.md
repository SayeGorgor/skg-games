# SKG Games architecture

```text
Browser
  ├─ Next.js App Router pages
  │   ├─ /                         SKG hub
  │   ├─ /games/alibi              Daily Alibi
  │   ├─ /games/perfect-stack      Perfect Stack
  │   └─ /plus                     SKG Plus marketing
  │
  ├─ Client game state
  │   ├─ immediate moves/timer in React
  │   └─ anonymous progress in localStorage
  │
  └─ Route handlers
      ├─ POST /api/games/complete
      └─ GET  /api/cron/publish-daily
               │
               ▼
         Neon Postgres + Drizzle
               │
       ┌───────┼────────┐
       ▼       ▼        ▼
   Neon Auth  Stripe*  Analytics
   (adapter)  Plus     / Sentry
```

## Site-wide advertising switch

`src/lib/ads.ts` reads `NEXT_PUBLIC_ADS_ENABLED`. Only the exact value
`true` enables advertising and Plus promotion; the default is disabled.
`ADS_ENABLED` has no effect.
`RootLayout` passes this value through `ViewerProvider` so client navigation,
home content, signup effects, and ad placements use the same setting.

When disabled, anonymous navigation offers Sign in and Sign up, the home page
omits Plus promotions and advertising copy, and account controls omit Plus labels.
Signup completion suppresses the Plus welcome dialog and treats premium intent
as standard. Direct `/plus` and `/plus/start` requests redirect to Sign in or,
for authenticated visitors, Account. Existing subscription entitlements remain
unchanged. Setting `NEXT_PUBLIC_ADS_ENABLED=true` restores the advertising/Plus experience.
Restart development or rebuild production after changing the environment setting,
since Next.js inlines public environment variables at build time.

Run `npx tsx scripts/verify-ads-mode.ts` against the local server to check the
disabled experience at mobile, tablet, and desktop widths. For an enabled server,
set `TEST_ADS_ENABLED=true`; set `TEST_BASE_URL` to target a different port.
The script also checks authenticated client controls using a mocked viewer response.

## Application boundaries

- Completed game history, durable browser queues, account synchronization, and
  `/stats` are described in [Game statistics](GAME-STATISTICS.md). They extend
  `game_attempts` and the existing viewer/claim boundaries.

- Game moves stay client-side; do not write every interaction to Postgres.
- The server is authoritative for published challenge data, final solution validation, subscription entitlement, and cross-device stats.
- Anonymous play is first-class. A generated anonymous UUID can later be claimed by an authenticated user.
- Neon Auth remains behind `lib/auth/identity.ts` so the game layer is vendor-agnostic.
- Ads are modeled as placements/configuration. The ad network should remain the source of truth for impression/revenue reporting.


*Stripe is planned; this diagram shows an intended boundary, not connected billing. See [current subscription status](AUTHENTICATION.md#planned-subscriptions-and-advertising).
