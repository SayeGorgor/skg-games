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
   Neon Auth  Stripe   Analytics
   (adapter)  Plus     / Sentry
```

## Boundary rules

- Game moves stay client-side; do not write every interaction to Postgres.
- The server is authoritative for published challenge data, final solution validation, subscription entitlement, and cross-device stats.
- Anonymous play is first-class. A generated anonymous UUID can later be claimed by an authenticated user.
- Neon Auth remains behind `lib/auth/identity.ts` so the game layer is vendor-agnostic.
- Ads are modeled as placements/configuration. The ad network should remain the source of truth for impression/revenue reporting.
