# Database model

## Catalog and publishing

- `games`: one row per game (`daily-alibi`, `perfect-stack`).
- `daily_challenges`: date/number/publish state plus generic public and private solution payloads.
- `alibi_cases`, `alibi_clues`, `alibi_suspects`: normalized Daily Alibi authoring data.
- `stack_puzzles`: Perfect Stack board/pieces/target/solution.
- `publish_runs`: audit trail for the daily publisher.

## Player state

- `game_attempts`: immutable-ish completion/attempt event records.
- History adds stable event IDs, daily result keys, puzzle dates, and validation
  flags to this table. See [migration and statistics details](GAME-STATISTICS.md).
- `user_game_stats`: aggregate streak and solve counters for fast profile reads.
- `user_profiles`: SKG-owned profile/preferences keyed by the managed auth user id.
- `anonymous_claims`: records ownership when local anonymous progress is merged into an account.

## Monetization

- `subscriptions`: Stripe identifiers and entitlement state. Never trust the browser for Plus status.
- `ad_placements`: enables/disables named ad slots by game/format without a code deploy.

## Why no FK to Neon Auth?

Managed authentication owns the `neon_auth` schema. SKG stores the auth user id as text and joins logically at the application/query layer rather than coupling migrations to managed auth internals.

## Phase 3 administrative authorization

All administrative data routes, actions, and query boundaries enforce their
own permissions. The shared navigation is a convenience. Session identity
comes from Neon Auth and authorization reads `public.user_roles` on each
decision. Existing sessions pick up role changes at the next authorization
check. Administrative pages are dynamic and private, with no-store,
noindex, and no-referrer controls.

| Capability | Owner | Admin | Analyst | Player |
| --- | --- | --- | --- | --- |
| Private analytics | Yes | Yes | Yes | No |
| User directory | Yes | Yes | No | No |
| Role management when enabled | Eligible Player, Analyst, and Admin accounts | Eligible Player and Analyst accounts | No | No |
| Audit history when enabled | Yes | No | No | No |

The POST-based user directory supports search, role filters, keyset
pagination, and intentional full ID copying. It uses the approved managed
Auth projection when available and explains when it falls back to application
profiles. The normal `skg_app` connection performs application reads and
writes within its existing grants. `neondb_owner` performs migrations and
operator work. The separate `skg_role_writer` and `skg_audit_reader` logins
have only their respective private function capabilities.

Both optional capabilities default to disabled and have distinct approval
flags. A deployment reporting `VERCEL_ENV=production` requires production
approval even if `NODE_ENV` differs. A production-mode process also requires
approval when `VERCEL_ENV` is unset or is any value other than `preview`.
Scope Preview secrets and flags to Preview. Missing or inconsistent writer
or reader connection configuration fails closed at the protected action or
query boundary.

## Isolated PostgreSQL role engine integration

Run this suite manually against a disposable Neon development branch containing
only synthetic data. Use an isolated Neon project with no production parent,
import, Auth integration, or traffic. Keep the role-management UI disabled
pending review of the live results.

### Confirm the destination and prepare Auth fixtures

1. In the Neon console, independently select the development project and verify
   its project ID and the branch ID. Inspect the branch lineage and confirm that
   its data and Neon Auth environment are synthetic. On that branch's endpoint
   details, confirm the direct compute endpoint ID and copy its connection
   hostname. Check all three test credentials against that same endpoint and
   database, and compare the project, branch and endpoint against the deployed
   production configuration. Record these independently verified IDs before
   attesting. A branch marker can be cloned, so a marker or approval flag alone
   cannot establish the mapping.
2. Independently confirm that the reviewed migrations through 0008 and the
   restricted writer provisioning are already in place. Use the existing
   reviewed operator workflow for missing prerequisites.
3. Generate a fresh lowercase UUID as the run nonce. Using the verified branch's
   Auth signup and verification flow or its supported Auth admin interface,
   create seven dedicated synthetic accounts using a domain you control. Use
   lowercase addresses with local parts in the form
   `skg-<lowercase-slot>-<nonce>`. The inventory slots are `owner`,
   `protectedOwner`, `admin`, `analyst`, `player`, `target` and `implicit`.
   Complete the normal Auth verification and confirm that each account signs in
   to the isolated environment. Capture each managed Auth UUID and email. Use
   fresh accounts and start with empty application-role and audit tables. The
   harness verifies the exact UUID/email pairs against managed Auth before
   seeding roles, and uses those fixture UUIDs as the trusted actor inputs.
4. In the confirmed branch's SQL editor as `neondb_owner`, create a fresh
   database-local marker using the independently verified IDs and nonce.
   Replace the placeholders before executing this SQL.

   ```sql
   BEGIN;
   CREATE SCHEMA skg_role_integration AUTHORIZATION neondb_owner;
   REVOKE ALL ON SCHEMA skg_role_integration FROM PUBLIC;
   CREATE TABLE skg_role_integration.target (
     project_id text NOT NULL,
     branch_id text NOT NULL,
     endpoint_id text NOT NULL,
     nonce uuid PRIMARY KEY
   );
   REVOKE ALL ON TABLE skg_role_integration.target FROM PUBLIC;
   INSERT INTO skg_role_integration.target
     VALUES ('<project ID>', '<branch ID>', '<direct endpoint ID>', '<run nonce>');
   COMMIT;
   ```

### Operator command

Use a clean shell with test-only environment variables. The command reads
process environment. Supply secrets via your private credential workflow.

| Variable | Value |
| --- | --- |
| `SKG_ROLE_INTEGRATION_ENABLED` | `yes` |
| `SKG_ROLE_INTEGRATION_PROJECT_ID` | Independently confirmed development project ID |
| `SKG_ROLE_INTEGRATION_BRANCH_ID` | Independently confirmed branch ID |
| `SKG_ROLE_INTEGRATION_ENDPOINT_ID` | Independently confirmed direct endpoint ID |
| `SKG_ROLE_INTEGRATION_NONCE` | Marker and account UUID nonce |
| `SKG_ROLE_INTEGRATION_FIXTURES` | JSON object keyed by the seven slots, each with `id` and `email` |
| `SKG_MIGRATION_DATABASE_URL`, `SKG_MIGRATION_EXPECTED_HOST`, `SKG_MIGRATION_EXPECTED_DATABASE`, `SKG_MIGRATION_EXPECTED_ROLE`, `SKG_MIGRATION_APPROVED_ISOLATED_BRANCH` | Isolated operator login, exact host/database, `neondb_owner`, and `yes` |
| `SKG_DB_VERIFY_DATABASE_URL`, `SKG_DB_VERIFY_EXPECTED_HOST`, `SKG_DB_VERIFY_EXPECTED_DATABASE`, `SKG_DB_VERIFY_EXPECTED_ROLE`, `SKG_DB_VERIFY_APPROVED_ISOLATED_BRANCH` | Isolated runtime login, same host/database, `skg_app`, and `yes` |
| `SKG_ROLE_WRITER_VERIFY_DATABASE_URL`, `SKG_ROLE_WRITER_VERIFY_EXPECTED_HOST`, `SKG_ROLE_WRITER_VERIFY_EXPECTED_DATABASE`, `SKG_ROLE_WRITER_VERIFY_EXPECTED_ROLE`, `SKG_ROLE_WRITER_VERIFY_APPROVED_ISOLATED_BRANCH` | Isolated writer login, same host/database, `skg_role_writer`, and `yes` |

```sh
npm run db:test-role-engine
```

The harness checks the database and login identities, the direct hostname and
marker, and the restricted logins' privilege baselines before seeding roles.
It refuses production mode and endpoints matching configured application
connection URLs. The suite commits synthetic assignments and their audit
history so a separate session can verify visibility. Discard the disposable
branch through your normal process after collecting results. Use a fresh branch
and fixture set if a write attempt was interrupted or a commit outcome is
ambiguous.

The race cases require a PostgreSQL-observed lock wait before the first request
commits. The observer verifies that the role row and audit are both invisible
before commit and checks their final state afterward. The audit failure case
uses the operator session to install an uncommitted fixture-specific check
constraint and call the same function within a savepoint. Both the constraint
and transaction are rolled back. The routine suite covers missing Auth
identities and reports managed Auth deletion during an in-flight request as
skipped, since it has no supported mechanism to coordinate a managed deletion
with that database transaction.

## Administrative role management

An Owner can change another account among Player, Analyst, and Admin. An
Admin can change another Player or Analyst between those two roles. Owner
targets and self-targets are protected. The same transition policy determines
UI options and checks the server request. The role editor shows the target,
current and proposed roles, and the permissions that would change. Cancel and
Escape dismiss the dialog before submission. Confirmation is unavailable
during submission, and focus returns to the originating button or the search
field if the refreshed row is gone.

The directory reads the role snapshot from PostgreSQL using the restricted
runtime connection. An implicit Player has no assignment row and sends
`null` for both stored role and revision. An explicit Player sends `player`
and its stored revision. Revisions are decimal strings through the browser
and action. The action checks the deployment gate, obtains a fresh Neon Auth
session, resolves the actor's database role, and validates the request.
The restricted writer calls the private function with the session-derived
actor ID. PostgreSQL rechecks the roles and expected state before committing
the role change and exactly one audit event together. The writer credential
can assert an actor ID to the function, so compromise of that credential
lets its holder impersonate a privileged actor at this boundary.

The action-driven directory refreshes the applied search, role filter, and
page through its existing private, authorized read path. Empty cursor pages
return to the first matching page. A stale result requires a new confirmation
using the refreshed role and revision. A timeout or transport failure can
occur after commit. The UI reports the result as unconfirmed, reloads
authoritative state, and requires a new confirmation before another attempt.
New authorization decisions read the current role from PostgreSQL, including
for sessions that were already signed in when their roles changed.

### Local development and Preview

Use only isolated synthetic accounts. Review the Phase 3B.1 live integration
and privilege output for the actual target before setting the attestations
below. Independently match both hostnames to that branch. Configure
`DATABASE_URL` for `skg_app` and `NEON_AUTH_BASE_URL` and
`NEON_AUTH_COOKIE_SECRET` for the same environment. Set the following
server-only values privately in the shell or local environment file.

| Variable | Value |
| --- | --- |
| `SKG_RBAC_ROLE_MANAGEMENT_ENABLED` | `yes` |
| `SKG_RBAC_WRITER_APPROVED_BRANCH` | `yes` after operator verification |
| `SKG_RBAC_WRITER_DATABASE_URL` | Dedicated isolated `skg_role_writer` credential |
| `SKG_RBAC_WRITER_EXPECTED_HOST` | Exact writer connection hostname |
| `SKG_RBAC_RUNTIME_EXPECTED_HOST` | Exact runtime connection hostname |
| `SKG_RBAC_EXPECTED_DATABASE` | Verified database name shared by both logins |

```powershell
$env:SKG_RBAC_ROLE_MANAGEMENT_ENABLED = "yes"
npm.cmd run dev
```

For a Preview deployment, apply the same isolated-target verification and
scope all settings to Preview. A production-mode process requires production
approval unless its deployment environment is explicitly Vercel Preview.
Verify the following with separate synthetic browser sessions.

1. Sign in as Owner and Admin and inspect the allowed options, protected
   accounts, permission descriptions, and keyboard behavior.
2. Promote an implicit Player and change an explicit Player. Verify the
   new role and the single audit record through the approved operator
   workflow.
3. Search, filter by role, and navigate to a later page. Change a role that
   removes the account from the filter and verify the refreshed page,
   announcement, pagination, and focus.
4. Open the same target in two sessions. Confirm one change, then submit
   the old confirmation. Verify the stale message and start a new
   confirmation from the refreshed row if appropriate.
5. Demote a signed-in synthetic Admin to Player from an Owner session.
   Reuse the existing Admin session and check fresh requests to
   `/admin/users`, directory actions, and `/admin/analytics`. Each must
   enforce the new role. Repeat the authorization check from a new session.
6. Check the Auth-backed and profile-fallback source notices, ID copying,
   360/768/1024/1440px layouts, light and dark themes, and role editor
   cancellation and pending behavior.

### Trust boundaries and known limitations

- `neondb_owner` is the operator and migration identity and owns the private
  `SECURITY DEFINER` function and audit table. `skg_app` is the regular
  runtime identity. It can read application roles but has no direct role writes,
  audit access, or privileged function execution. `skg_role_writer` can call
  `skg_private.assign_application_role` and has no direct role or audit table
  access. PUBLIC has no execution privileges on the private function.
- Migration `0008_role_change_engine.sql` installs the revision and role engine.
  The function validates the supplied actor's database role. Neon Auth session
  authentication happens in the Server Action. A stolen writer credential can
  supply a forged privileged actor ID. Credential separation protects the
  ordinary runtime connection and leaves writer or full server compromise in
  scope for incident response.
- The writer branch approval is an operator attestation. Independently verify
  the project, branch, database, and endpoint mappings. Privileged operator SQL
  can bypass the advisory lock used by application role changes.
- Each successful transition inserts one audit event with the session-derived
  actor ID, target ID, previous and new roles, and database timestamp. Denied,
  stale, and no-op requests create no role-assignment event. An HTTP abort can
  leave the commit outcome ambiguous. Check current state before reconfirming.
- The live harness checks missing Auth identities and skips managed Auth deletion
  during an in-flight request. The confirmation dialog provides a review step.
  It provides neither MFA nor step-up authentication.

## Administrative audit history

The private `/admin/audit` route requires `audit:read`, assigned only to
Owner. The layout, page, POST action and query independently authorize
access. They use the trusted Neon Auth session and a fresh database role
lookup at each authorization boundary. The feature defaults to disabled
and is independent of role management.

Migration `0009_admin_audit_reader.sql` creates
`skg_private.list_role_audit_events(text,text,text,timestamptz,timestamptz,text,public.app_role,timestamptz,uuid,integer)`.
The fixed-search-path, `STABLE SECURITY DEFINER` function is owned by
`neondb_owner`, the existing audit table owner. It reads only the audit
table, with no dynamic SQL or Auth/profile joins. It creates no audit rows
and leaves RLS and Phase 3B unchanged. One migration statement creates
the function, revokes PUBLIC and grants private-schema USAGE and function
EXECUTE to `skg_audit_reader`. The migration rejects unexpected function
ACLs, overloads, or cross-service function access. `skg_app` and
`skg_role_writer` receive no audit read grants. The only new index is
`(created_at DESC NULLS LAST, id DESC NULLS LAST)`, which supports
ordered keyset reads across both event types. Review its build lock and
storage cost before applying the migration to a large table.

The DTO contains event ID, action, actor classification, canonical actor and
target IDs when available, previous role, new role, and UTC timestamp.
Bootstrap events identify the operator workflow. A null previous role is
displayed as **No stored role**. Historical noncanonical references are
displayed as unavailable, and retained canonical IDs can represent deleted
accounts. Rows show shortened IDs, with full canonical IDs in Owner-only
event details. Operator references, emails and Auth records are excluded.
The database owner retains authority over the underlying history. The audit
reader credential can enumerate the approved projection even without an
Owner web session and must be protected separately from the runtime and writer.

The page reads up to 25 events and requests one lookahead row. The function
caps results at 26. The cursor uses the exact UTC timestamp and UUID as a
tie-breaker, without conversion through millisecond precision. Filters are
submitted by POST and match event type, actor/target UUID, previous/new role
and UTC date window. Presets include all dates, 7, 30, 90 days, and custom
ranges of up to 366 inclusive dates. The first-page control resets the
cursor, and the Older events control retains the current filters.

### Isolated provisioning and verification

1. Independently verify the intended Neon project, synthetic development
   branch, database, and endpoint mappings for both reader and `skg_app`.
   Compare them with the production configuration. Use an isolated synthetic
   branch with no production parent or imports. Attestation is operator
   confirmation and does not prove branch identity.
2. Review migration 0008 state and function ACLs. As the isolated
   `neondb_owner` on `neondb`, set the session approval
   `skg.approved_isolated_branch=yes` and manually review and execute
   `scripts/database/provision-audit-reader.sql` with stop-on-error. It refuses
   an existing role, uses a NULL password and sets a five-second login
   statement timeout. Give the reader its separately reviewed secret using
   the operator-approved Neon role credential workflow. Use private secret
   storage and deployment settings, never tracked SQL or shell history. For
   rotation, obtain the replacement via that workflow, update the server-only
   secret, independently verify the new login, then retire the old credential.
   Use the platform's reviewed workflow instead of psql password commands.
3. Review and apply 0009 through the existing isolated migration workflow.
   Set the verifier variables in a private shell. The CLI reads the shell,
   checks the declared endpoint and server identity and emits categorical
   results. Use it only on the independently verified isolated branch.

   - `SKG_AUDIT_READER_VERIFY_DATABASE_URL`
   - `SKG_AUDIT_READER_VERIFY_EXPECTED_HOST`
   - `SKG_AUDIT_READER_VERIFY_EXPECTED_DATABASE`
   - `SKG_AUDIT_READER_VERIFY_EXPECTED_ROLE=skg_audit_reader`
   - `SKG_AUDIT_READER_VERIFY_APPROVED_ISOLATED_BRANCH=yes`

   Run `npm run db:verify-audit-reader`. It reviews effective identity,
   ownership, ACLs, RLS, timeout and function boundaries, then runs rollback-only
   denial probes and a read-only function call. Also rerun the existing isolated
   runtime and writer verifiers and review Phase 3B integration evidence.

4. For `npm run db:test-audit-reader`, manually prepare three synthetic
   `role_assignment` audit events for one fresh target in the approved
   disposable branch. Use the same recorded timestamp for at least the two
   newest events. Put a null previous role in the newest event, explicit Player
   in the second, and a non-null previous role in the third. The branch
   operator owns preparation and teardown. Record the target UUID and three
   event UUIDs in descending timestamp/UUID order as the private JSON object
   `{"target":"<uuid>","ids":["<newest>","<second>","<third>"]}` in
   `SKG_AUDIT_READER_VERIFY_FIXTURE`. Also set
   `SKG_AUDIT_READER_VERIFY_INTEGRATION=yes`. The command uses the reader's
   existing privilege checks and tests filtered keyset reads in a read-only
   transaction. It does not seed or modify the database.
5. When isolated verification passes, configure server-side development or
   Preview settings using the table below. In Preview, verify Owner reads,
   generic denial for other roles and signed-out requests, access loss after
   an Owner role change through the approved workflow, UTC presets, filters,
   details, older pages, empty/unavailable states, and data privacy. Verify
   Phase 3B role transitions still work through the separate writer.

| Variable | Value |
| --- | --- |
| `SKG_AUDIT_HISTORY_ENABLED` | `yes` only on the approved deployment |
| `SKG_AUDIT_HISTORY_PRODUCTION_APPROVED` | Keep blank in development and Preview |
| `SKG_AUDIT_READER_DATABASE_URL` | Dedicated server-only reader credential |
| `SKG_AUDIT_READER_EXPECTED_HOST` | Exact reader hostname |
| `SKG_AUDIT_RUNTIME_EXPECTED_HOST` | Exact independently verified runtime hostname |
| `SKG_AUDIT_EXPECTED_DATABASE` | Shared database name |
| `SKG_AUDIT_READER_APPROVED_BRANCH` | `yes` after independent mapping and verification |

## Coordinated Phase 3 production rollout

Use the [operator rollout worksheet](../developer-docs/phase-3-production-rollout.md)
for staged execution, the environment inventory, and manual read-only catalog
checks. The [readiness matrix](../developer-docs/phase-3-production-readiness.md)
records release gates and evidence. The checked-in migration CLI and privilege
probes remain isolated-development tools. Production needs a separately
approved migration procedure and a reviewed 0009 lock window. See the
[one-time production runner](#one-time-production-00080009-migration-runner)
for the exact 0007-to-0009 path.

This checklist requires separate operator approval. Complete the relevant
isolated integration steps before a production release. Phase 3B role
management and Phase 3C audit history are independent releases.

1. Independently verify the Neon production project, branch and database.
   Map each exact runtime, writer and reader hostname to that branch,
   including pooled or direct endpoints. Confirm production's existing
   `skg_app` login, privileges and application compatibility.
2. Review production migration history and requirements through 0009.
   Review existing 0007 audit constraints and RLS, 0008 writer prerequisites
   and 0009 reader prerequisites. Provision the distinct production writer
   and reader only if needed, using separately reviewed production procedures
   and dedicated server-only credentials. For 0009, the regular index build
   can block audit table writes until the migration transaction commits.
   Estimate the table size and write load, schedule a suitable window, and
   review lock and timeout behavior before applying it. Any future change to
   the index build strategy requires a separately reviewed additive migration.
3. Use approved production-safe read-only metadata checks for database and
   login identities, role attributes and memberships, table and schema
   ownership, effective grants and RLS, function signatures, ownership and
   fixed search paths, overloads, and PUBLIC revocations. Confirm the writer
   and reader cannot invoke each other's function. Reserve the isolated
   privilege probes, fixture creation, and concurrency tests for development.
4. Review retained isolated verification evidence. Verify an ordinary
   production build and deployment health. Audit the runtime, writer, reader
   and Auth secret scopes and server-only flags. Review privacy controls,
   Sentry settings and alerts. Complete authenticated Preview QA for the
   directory, the independent feature gates, role transitions and demotion,
   and Owner-only audit reads and generic denials.
5. Document rollback, operational monitoring and explicit approval for each
   capability. For approved role management, enable only
   `SKG_RBAC_ROLE_MANAGEMENT_ENABLED=yes` and
   `SKG_RBAC_ROLE_MANAGEMENT_PRODUCTION_APPROVED=yes`. For approved audit
   history, enable only `SKG_AUDIT_HISTORY_ENABLED=yes` and
   `SKG_AUDIT_HISTORY_PRODUCTION_APPROVED=yes`. Use a controlled deployment or
   configuration rollout. Keep unapproved capabilities disabled.
6. Verify private headers, Owner/Admin permissions, safe audit reads and
   unauthorized denials after deployment. Use approved accounts and
   procedures, and avoid production synthetic audit or concurrency fixtures.
   Monitor aggregate authorization, writer, audit-read and audit-integrity
   signals without identifiers or row payloads. Record approvals, deployed
   revision, verified targets, checks and any rollback in the private release
   record.
7. If a critical permission, audit-integrity or privacy issue appears, remove
   enablement and approval for the affected feature from the effective
   deployment and roll out the disabled configuration. Confirm that its
   route or mutation rejects access. Preserve roles, applied migrations,
   assignments, and audit history. Keep the unaffected feature gated according
   to its own approval.

Credential compromise is treated separately from flag rollback. A stolen
writer can assert a privileged actor ID to PostgreSQL. A stolen reader can
enumerate the function projection. The database owner retains authority over
the history. Investigate and rotate affected credentials through the approved
incident process.

### One-time production 0008/0009 migration runner

This runner is separate from the isolated development migrator. Use it only
for the approved production database reported to be on 0007. The reported
operator, provisioned roles, ownership, audit RLS and table size must be
rechecked. Both optional application features stay disabled during the window.

**Operator approval and independent target review.** Before either mode,
independently map the direct Neon endpoint to the production project, branch
and database in the operator console. Verify the role and branch with a
second reviewer. Approval text and matching hostnames are attestations and
configuration checks. Use a clean checkout of the reviewed full commit,
from the repository root, with its locked dependencies. The runner checks
the commit and clean worktree and compares migration content to Git. Local
Drizzle file hashes must match every historical ledger entry byte-for-byte.
Check the expected checkout line endings if they differ. Never alter the
ledger or migration files to make the comparison pass.

**Process environment variable names**

- `NODE_ENV`
- `SKG_PROD_MIGRATION_DATABASE_URL` (secret, only in the private operator shell)
- `SKG_PROD_MIGRATION_EXPECTED_HOST`
- `SKG_PROD_MIGRATION_EXPECTED_DATABASE`
- `SKG_PROD_MIGRATION_EXPECTED_ROLE`
- `SKG_PROD_MIGRATION_REVIEWED_REVISION`
- `SKG_PROD_MIGRATION_APPROVED_TARGET`
- `SKG_PROD_MIGRATION_APPROVED_APPLY` (apply mode only)

The production marker is required. The runner is deliberately scoped to
`neondb`, `neondb_owner`, a direct TLS Neon endpoint, and the stated 0007
ledger anchor. The two approvals are explicit `yes` attestations. Leave the
apply variable unset for read-only runs. Supply the secret from an approved
private source without placing it in shell history, tracked files, other
deployment settings, or diagnostic output. The runner never loads dotenv or
uses `DATABASE_URL`.

1. **Read-only preflight** after approving the independently verified target.

   ```powershell
   Remove-Item Env:SKG_PROD_MIGRATION_APPROVED_APPLY -ErrorAction SilentlyContinue
   npm.cmd run db:migrate-phase3-production -- --preflight
   ```

   Expect the exact ledger through 0007 and no objects created by 0008 or 0009.
   Preflight runs inside a repeatable-read, read-only transaction. It checks
   identities, table owners, audit RLS, managed Auth prerequisites, effective
   grants, and the full ledger. Record the two printed hashes and the approved
   revision privately. A complete 0009 ledger with valid objects is reported
   as already applied. Any partial ledger or inconsistent objects stop the run.

2. **REQUIRES EXPLICIT OPERATOR APPROVAL.** Confirm recovery readiness, review
   the charged 0009 write-lock window using a separate read-only estimate and
   rehearsal, pause competing migrations and operator writes, and record
   approval for these two hashes. The runner allows 3 seconds per lock
   acquisition and 30 seconds per statement. The regular audit index build
   can block audit-table inserts until the outer commit. The ledger is also
   exclusively locked during apply. If those limits or the maintenance
   window are unsuitable, stop for a reviewed migration strategy.
   Set the additional apply attestation through the operator process, then
   run once from the same reviewed checkout.

   ```powershell
   npm.cmd run db:migrate-phase3-production -- --apply
   ```

   Apply repeats preflight while holding the ledger lock and refuses any
   starting point other than exactly 0007. The installed Neon HTTP migrator
   executes the migration statements and ledger inserts separately and is
   unsuitable for this change. The production runner uses one Neon WebSocket
   client and Drizzle ORM 0.45.4's PostgreSQL migration engine. The runner
   starts the outer transaction before checks and locking. The adapter uses
   a savepoint on that same connection, with Drizzle executing the original
   files and registering the ledger rows. The runner checks the complete
   ledger and resulting objects and effective ACLs before committing both
   migrations and both ledger inserts together.

3. **Read-only postflight.** Repeat the preflight command in a fresh session
   with apply approval unset. Expect the ledger through 0009, the same two
   hashes, exact function signatures and owners, restricted execution, the
   revision column and constraint, valid index, no direct audit access or
   role writes from service identities, and preserved audit RLS. Use catalog
   evidence only. Do not call the production writer to test it.

**Failure and recovery.** Stop on any error, connection loss, or ambiguous
commit. Keep optional features disabled and run only fresh read-only preflight.
If the ledger is exactly 0007 and prerequisite objects are still absent,
review the failure and obtain a new explicit approval before any later
attempt. If the ledger is exactly 0009 and expected object and ACL checks
pass, record the completed migration. Any mixed state, hash drift, or failed
object check requires a separately reviewed forward recovery. No blind replay,
manual ledger edits, provisioning changes, or automatic retry. A rolled-back
attempt can consume sequence values without adding committed ledger rows.
