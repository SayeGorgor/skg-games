-- OPERATOR-REVIEWED ISOLATED DEVELOPMENT TEMPLATE. Run manually with ON_ERROR_STOP.
-- Independently confirm the project, branch, database and endpoint before attesting.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
DO $guard$
BEGIN
  IF current_setting('skg.approved_isolated_branch', true) IS DISTINCT FROM 'yes'
     OR current_database() <> 'neondb'
     OR current_user <> 'neondb_owner' OR session_user <> 'neondb_owner' THEN
    RAISE EXCEPTION 'Approved isolated development operator and database required';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'skg_audit_reader') THEN
    RAISE EXCEPTION 'Existing reader requires independent privilege inspection';
  END IF;
END
$guard$;
CREATE ROLE skg_audit_reader LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD NULL;
ALTER ROLE skg_audit_reader SET statement_timeout = '5s';
GRANT CONNECT ON DATABASE neondb TO skg_audit_reader;
COMMIT;
-- Initialize or rotate secrets through the reviewed Neon workflow. Do not use psql \password.
