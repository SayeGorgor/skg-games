# Neon Managed Better Auth

The app uses `@neondatabase/auth` (current SDK 0.7.0-beta), its Next.js proxy,
and the existing `getIdentity()` boundary. It does not use Stack Auth. Neon owns
passwords, OAuth exchange, verification/reset tokens, and session cookies.

## Setup

Enable **Managed Better Auth** on the Neon branch used by `DATABASE_URL`.
Copy its Auth base URL into `NEON_AUTH_BASE_URL`. Set a random
`NEON_AUTH_COOKIE_SECRET` of at least 32 characters (for example,
`openssl rand -base64 32`). Never use a public environment variable for secrets.
Leaving both variables blank preserves anonymous-only demo mode. Partial or
invalid configuration fails initialization with a setup message.

Enable email/password, configure email delivery and the desired verification
policy in Neon. Verification stays provider-controlled; signup without a session
shows a check-your-email message. Password reset uses the managed request/reset
APIs. Confirm actual reset/verification emails and their app callbacks before
launch. No provider configuration or live authentication records are modified
by this implementation.

Enable Google for the branch. Neon's shared development Google credentials may
be used locally when enabled. Configure your own Google credentials in Neon
before production for SKG branding/control. Google Console's **Authorized
Redirect URI** must be exactly `{NEON_AUTH_BASE_URL}/callback/google`, copied
from the branch configuration, e.g.
`https://ep-example.neonauth.us-east-2.aws.neon.tech/neondb/auth/callback/google`.
It is not localhost or the SKG home URL. Google returns to Neon; the SDK's
`callbackURL` and `newUserCallbackURL` then return from Neon to SKG.

Allow localhost in Neon's development settings. Add the actual deployed SKG
origin(s) to Neon's trusted domains before deployment; no production domain is
assumed in code. Keep callbacks on those origins. Test cancellation/failure,
new/existing Google users, and both purchase and standard intents.

SDK dependency overrides patch Better Auth/Core/OAuth Provider to 1.7.14,
Better Fetch to 1.3.3, Better Call to 1.4.4, and Zod to 4.6.7, addressing
advisories in the SDK's exact dependency pins. Recheck these overrides when
upgrading Neon. No custom Better Auth server or database adapter runs in SKG.

## Routes and flows

Created: `src/lib/auth/{server,client,viewer,flow,claim,game-handoff}.ts`,
the corresponding flow/claim/handoff unit tests, `src/components/auth/*`,
`src/app/auth/[path]/page.tsx`, `src/app/auth/complete/page.tsx`,
`src/app/account/page.tsx`, `src/app/api/auth/{[...path],viewer,claim-anonymous}/route.ts`,
`src/app/plus/start/route.ts`, and `scripts/verify-auth.ts`.
Modified: package manifest/lockfile, `.env.example`, README, root layout/global
CSS, header, ad slot, home Plus links, Plus page, both game components,
`src/lib/auth/identity.ts`, database attempt writer, and game completion route.

`/auth/sign-up`, `/auth/sign-in`, `/auth/forgot-password`, and
`/auth/reset-password` share themed, responsive forms. `intent` accepts only
`standard` and `premium`. `returnTo` accepts internal paths and rejects external
destinations and auth/API loops.

`/auth/complete` verifies the session, lazily ensures the profile, then runs an
authenticated POST to `/api/auth/claim-anonymous`. After a standard new signup,
the global welcome dialog consumes/removes `welcome=plus` immediately. A
tab-local consumed marker prevents completion-page refreshes from replaying it.
The `new` flag affects UI only, never identity or entitlement. Google supplies
separate existing/new-user callbacks. Email verification pending state is kept
only in sessionStorage until the matching email signs in (up to 24 hours).
Existing sign-in does not normally trigger the dialog. Escape, close, and
Continue without subscribing all dismiss it.

All purchase CTAs use `/plus/start`. Anonymous requests go to premium-intent
signup; authenticated free users go directly to the Plus purchase page;
entitled users go to Account. Premium-intent auth skips the welcome ad. There
is **no connected payment provider**: Plus explicitly says payments are not yet
available. No subscription is created or activated. A future checkout endpoint
must independently call `getViewer()`; never accept a client identity.

`/account` checks authentication server-side. No global auth middleware is
installed. Home, Plus information, both games, Practice APIs, and free completion
remain public. Sign-out uses Neon and leaves local progress/theme untouched.

## Identity, entitlement, and data

`getViewer()` resolves session user identity server-side and idempotently inserts
`user_profiles.user_id` (already the Neon user ID). Existing profile and
subscription columns suffice; **no schema migration is needed**. SKG does not
create auth user/password/token tables or foreign keys into managed schemas.

Premium comes only from `subscriptions`: active/trialing with a future
`current_period_end`. Cancellation at period end retains entitlement until that
date; past_due/canceled/incomplete/expired/missing rows do not grant it. Missing
DB/entitlement errors fail closed to free. Client context receives only this
server result; localStorage and request parameters cannot grant membership.
Ad components read that result. Logout reloads public state.

Game completion uses `getIdentity()`; an authenticated user ID always wins over
browser-supplied fields. Anonymous completion retains the existing browser UUID.
The browser ID is an unguessable bearer identifier, not an independently verified
device identity. Claim requests require a session, same-origin POST, and a valid
UUID; they accept no user ID. Claim ownership is permanently reserved by
`anonymous_claims` to the first account. A second account cannot steal it.

Claims use Drizzle Neon HTTP **batch transactions** for claim insert, attempt
association, and owner lookup. Repeating the operation does not move already
associated attempts. Existing finalized Alibi accusations win, including failed
accusations. For Stack, a better anonymous completed attempt (fewer moves, which
also determines stars) joins account history; equivalent or worse attempts remain
anonymous. No account result is overwritten or deleted. Stack variants are independent. Practice
attempt history is associated as well. Started/incomplete account attempts do
not block completed anonymous results. Attempts remain history, not cloud saves;
local completed boards, accusations, theme, and Practice state are never cleared.
Leaving either game for authentication also stores a temporary tab-local handoff:
Stack placements/rotations/moves/time or Alibi's unsubmitted selection. Returning
to the same puzzle validates and consumes it; a finalized local result always
takes precedence. Practice return links preserve difficulty and seed parameters.
There is no cross-device restoration or stats recomputation in this task.
If the DB is unavailable, completion remains locally usable and claim offers
retry/continue. Another account's prior browser claim does not block signing in.

## Verification

Run `npm test`, `npm run lint`, `npm run build`, and `npm run test:auth-browser`
(with the development server running). Unit checks cover redirect attacks,
intent preservation, entitlement expiry, welcome decisions, UUID validation,
and the atomic/idempotent claim query contract. Browser checks use mocked
provider responses for validation/error behavior; they do not replace live
Neon email/Google tests. Run the existing Stack and Alibi persistence checks
to verify anonymous play after integration. Real Google consent, email delivery,
verified sessions, and payment entitlements require the configured Neon branch
and provider console checks described above.

Validation in this change: 41 unit tests, lint, and production build passed.
Auth browser checks cover 320/390/768/1024/1440px in both themes, account guards,
purchase intent, malicious return paths, rejected anonymous/cross-origin claims,
password confirmation, provider errors, Google callback payloads, unfinished-game
handoffs, welcome-dialog sizing/Escape/URL consumption, and sign-out storage.
The Stack/Alibi persistence scripts also pass. Live provider signup/sign-in and
real PostgreSQL claim concurrency are not simulated by the unit query-contract
tests and remain deployment verification steps. The dependency audit retains
low/moderate transitive advisories; no high/critical findings remain after the
targeted SDK overrides (no forced dependency downgrade was applied).
