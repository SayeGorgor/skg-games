-- OPERATOR-REVIEWED TEMPLATE ONLY. Do not run automatically.
-- Independently verify the endpoint and isolated development branch first.
-- Run in psql with ON_ERROR_STOP and set skg.approved_isolated_branch to yes.
-- The database and operator checks below are deliberately specific to the
-- existing development provisioning workflow; review before any other use.
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
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'skg_role_writer') THEN
    RAISE EXCEPTION 'Existing writer requires independent privilege inspection';
  END IF;
END
$guard$;
CREATE ROLE skg_role_writer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD NULL;
ALTER ROLE skg_role_writer SET statement_timeout = '10s';
GRANT CONNECT ON DATABASE neondb TO skg_role_writer;
-- No schema or function grants are made here. They require a reviewed function
-- migration and effective-privilege verification, including PUBLIC privileges.
COMMIT;
-- Password initialization/rotation must use an operator-approved Neon-compatible
-- secret workflow. Do not use psql \password; it is not supported here.
-- This repository does not establish a verified password-setting procedure.
-- Do not distribute credentials until the effective privilege baseline passes.
