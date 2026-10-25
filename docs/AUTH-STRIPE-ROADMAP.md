# Auth + SKG Plus rollout

## Neon Auth

1. Enable Auth on the Neon branch.
2. Add `@neondatabase/auth` and optionally `@neondatabase/auth-ui` pinned to the tested beta version.
3. Configure `NEON_AUTH_BASE_URL` and a 32+ character `NEON_AUTH_COOKIE_SECRET`.
4. Implement `getIdentity()` with `createNeonAuth()` from `@neondatabase/auth/next/server`.
5. Keep anonymous play enabled. After sign-in, claim the browser anonymous UUID and merge eligible attempts/streak state.

## Stripe

1. Create monthly/yearly SKG Plus prices.
2. Create Checkout Sessions server-side.
3. Store `stripeCustomerId` after checkout.
4. Process signed subscription webhooks and update `subscriptions`.
5. Determine `isPlus` on the server from the subscription row.
6. Hide ad placements only after the server has resolved the entitlement.

Do not use the Checkout success redirect as the source of truth for payment state.
