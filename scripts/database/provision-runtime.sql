-- TEMPLATE ONLY. Operator must independently confirm isolated branch/endpoint.
-- Manually run with psql ON_ERROR_STOP. Not a Drizzle migration. No credentials.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
DO $guard$
BEGIN
  IF current_setting('skg.approved_isolated_branch', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'Explicit operator approval of isolated development branch required';
  END IF;
  IF current_database() <> 'neondb' OR current_user <> 'neondb_owner' OR session_user <> 'neondb_owner' THEN
    RAISE EXCEPTION 'Unexpected operator or database';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'skg_app') THEN
    RAISE EXCEPTION 'Existing skg_app requires independent privilege review';
  END IF;
END
$guard$;
CREATE ROLE skg_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD NULL;
GRANT CONNECT ON DATABASE neondb TO skg_app;
GRANT USAGE ON SCHEMA public TO skg_app;
-- BEGIN generated runtime grants
GRANT SELECT ON TABLE public.games TO skg_app;
GRANT SELECT ON TABLE public.daily_challenges TO skg_app;
GRANT UPDATE (published_at) ON TABLE public.daily_challenges TO skg_app;
GRANT SELECT ON TABLE public.alibi_cases TO skg_app;
GRANT SELECT ON TABLE public.alibi_clues TO skg_app;
GRANT SELECT ON TABLE public.alibi_suspects TO skg_app;
GRANT SELECT ON TABLE public.stack_puzzles TO skg_app;
GRANT SELECT ON TABLE public.game_attempts TO skg_app;
GRANT INSERT ON TABLE public.game_attempts TO skg_app;
GRANT UPDATE (user_id, result, puzzle_seed) ON TABLE public.game_attempts TO skg_app;
GRANT SELECT ON TABLE public.user_profiles TO skg_app;
GRANT INSERT ON TABLE public.user_profiles TO skg_app;
GRANT UPDATE (email, updated_at) ON TABLE public.user_profiles TO skg_app;
GRANT SELECT ON TABLE public.anonymous_claims TO skg_app;
GRANT INSERT ON TABLE public.anonymous_claims TO skg_app;
GRANT SELECT ON TABLE public.subscriptions TO skg_app;
GRANT SELECT ON TABLE public.user_roles TO skg_app;
GRANT INSERT ON TABLE public.publish_runs TO skg_app;
-- END generated runtime grants
REVOKE ALL ON TABLE public.role_assignment_audit FROM skg_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.user_roles FROM skg_app;
DO $verify$
BEGIN
  IF has_schema_privilege('skg_app', 'public', 'CREATE') OR
     has_database_privilege('skg_app', current_database(), 'CREATE') OR
     EXISTS (SELECT 1 FROM pg_auth_members WHERE member = 'skg_app'::regrole) OR
     EXISTS (SELECT 1 FROM pg_class WHERE relowner = 'skg_app'::regrole) OR
     EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
       AND has_schema_privilege('skg_app', n.oid, 'USAGE')
       AND has_function_privilege('skg_app', p.oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'Unexpected public/inherited privilege; rollback and review';
  END IF;
END
$verify$;
COMMIT;
-- No memberships, managed Auth grants, sequences or custom function grants.
-- After review only, set password using interactive psql: \password skg_app
-- Run separate verification before distributing/cutting over runtime URLs.
