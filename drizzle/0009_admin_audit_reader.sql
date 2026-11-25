-- Keep creation, PUBLIC revocation and ACL verification in one HTTP migration statement.
DO $migration$
DECLARE
  reader_oid oid;
  audit_function oid;
BEGIN
  SELECT r.oid INTO reader_oid FROM pg_catalog.pg_roles r WHERE r.rolname = 'skg_audit_reader'
    AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_shdepend d
      WHERE d.refclassid = 'pg_catalog.pg_authid'::regclass AND d.refobjid = r.oid AND d.deptype = 'o');
  IF current_user <> 'neondb_owner' OR session_user <> 'neondb_owner' OR reader_oid IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname = 'skg_private' AND n.nspowner = current_user::regrole)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
       WHERE c.oid = 'public.role_assignment_audit'::regclass AND c.relowner = current_user::regrole
         AND c.relrowsecurity AND NOT c.relforcerowsecurity)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'skg_private' AND p.proname = 'list_role_audit_events')
     OR pg_catalog.has_function_privilege(reader_oid, 'skg_private.assign_application_role(text,text,text,text,bigint)', 'EXECUTE')
  THEN RAISE EXCEPTION 'Audit reader prerequisites not met'; END IF;

  CREATE INDEX role_audit_history_idx ON public.role_assignment_audit (created_at DESC NULLS LAST, id DESC NULLS LAST);
  CREATE FUNCTION skg_private.list_role_audit_events(
    event_action text, actor_id text, target_id text,
    from_at timestamptz, until_at timestamptz,
    old_role text, next_role public.app_role,
    before_at timestamptz, before_id uuid, page_limit integer
  ) RETURNS TABLE (
    id uuid, actor_type text, action text, actor_user_id text,
    target_user_id text, previous_role public.app_role, new_role public.app_role, created_at timestamptz
  )
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $function$
  BEGIN
    IF page_limit IS NULL OR page_limit NOT BETWEEN 1 AND 26
       OR (event_action IS NOT NULL AND event_action NOT IN ('role_assignment','owner_bootstrap'))
       OR (old_role IS NOT NULL AND old_role NOT IN ('implicit','player','analyst','admin','owner'))
       OR (actor_id IS NOT NULL AND actor_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
       OR (target_id IS NOT NULL AND target_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
       OR ((from_at IS NULL) <> (until_at IS NULL))
       OR (from_at IS NOT NULL AND (NOT isfinite(from_at) OR NOT isfinite(until_at)
         OR from_at >= until_at OR until_at - from_at > interval '366 days'))
       OR ((before_at IS NULL) <> (before_id IS NULL))
       OR (before_at IS NOT NULL AND NOT isfinite(before_at))
    THEN RAISE EXCEPTION 'Invalid audit query' USING ERRCODE = '22023'; END IF;

    RETURN QUERY SELECT a.id, a.actor_type, a.action, a.actor_user_id, a.target_user_id,
      a.previous_role, a.new_role, a.created_at
    FROM public.role_assignment_audit a
    WHERE (event_action IS NULL OR a.action = event_action)
      AND (actor_id IS NULL OR a.actor_user_id = actor_id)
      AND (target_id IS NULL OR a.target_user_id = target_id)
      AND (from_at IS NULL OR (a.created_at >= from_at AND a.created_at < until_at))
      AND (old_role IS NULL OR (old_role = 'implicit' AND a.previous_role IS NULL)
        OR a.previous_role = NULLIF(old_role, 'implicit')::public.app_role)
      AND (next_role IS NULL OR a.new_role = next_role)
      AND (before_at IS NULL OR (a.created_at, a.id) < (before_at, before_id))
    ORDER BY a.created_at DESC NULLS LAST, a.id DESC NULLS LAST
    LIMIT page_limit;
  END
  $function$;

  REVOKE ALL ON FUNCTION skg_private.list_role_audit_events(text,text,text,timestamptz,timestamptz,text,public.app_role,timestamptz,uuid,integer) FROM PUBLIC;
  GRANT USAGE ON SCHEMA skg_private TO skg_audit_reader;
  GRANT EXECUTE ON FUNCTION skg_private.list_role_audit_events(text,text,text,timestamptz,timestamptz,text,public.app_role,timestamptz,uuid,integer) TO skg_audit_reader;
  audit_function := 'skg_private.list_role_audit_events(text,text,text,timestamptz,timestamptz,text,public.app_role,timestamptz,uuid,integer)'::regprocedure;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
    WHERE p.oid = audit_function
      AND (acl.grantee NOT IN (p.proowner, reader_oid) OR (acl.grantee = reader_oid AND acl.is_grantable))
  ) OR pg_catalog.has_function_privilege('skg_app', audit_function, 'EXECUTE')
    OR pg_catalog.has_function_privilege('skg_role_writer', audit_function, 'EXECUTE')
    OR pg_catalog.has_schema_privilege(reader_oid, 'skg_private', 'CREATE')
  THEN RAISE EXCEPTION 'Unexpected audit reader privileges'; END IF;
END
$migration$;
