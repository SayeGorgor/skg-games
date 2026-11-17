DO $migration$
BEGIN
  -- The HTTP migrator executes each journal entry as a single statement.
  -- Refuse unknown owners, pre-existing schema, or an unreviewed writer.
  IF current_user <> 'neondb_owner' OR session_user <> 'neondb_owner'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname='skg_role_writer'
       AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit)
       AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='skg_private')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid='public.user_roles'::regclass AND c.relowner=current_user::regrole)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid='public.role_assignment_audit'::regclass AND c.relowner=current_user::regrole AND c.relrowsecurity AND NOT c.relforcerowsecurity)
     OR NOT pg_catalog.has_table_privilege(current_user, 'neon_auth."user"', 'SELECT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'neon_auth."user"', 'UPDATE')
  THEN RAISE EXCEPTION 'Role engine prerequisites not met; inspect ownership and privileges'; END IF;
  EXECUTE 'ALTER TABLE public.user_roles ADD COLUMN role_revision bigint NOT NULL DEFAULT 0 CONSTRAINT user_roles_role_revision_check CHECK (role_revision >= 0)';
  EXECUTE 'CREATE SCHEMA skg_private AUTHORIZATION neondb_owner';
  EXECUTE 'REVOKE ALL ON SCHEMA skg_private FROM PUBLIC';
  EXECUTE $create$
    CREATE FUNCTION skg_private.assign_application_role(
      actor_id text, target_id text, requested_role text,
      expected_role text, expected_revision bigint
    ) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
    SET lock_timeout = '3s'
    AS $body$
    DECLARE
      actor_role public.app_role;
      stored_role public.app_role;
      revision bigint;
      found_target boolean;
    BEGIN
      IF actor_id IS NULL OR target_id IS NULL
         OR actor_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         OR target_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         OR requested_role IS NULL OR requested_role NOT IN ('player','analyst','admin')
         OR (expected_role IS NULL AND expected_revision IS NOT NULL)
         OR (expected_role IS NOT NULL AND (expected_role NOT IN ('player','analyst','admin','owner') OR expected_revision IS NULL OR expected_revision < 0))
         OR actor_id = target_id THEN RETURN 'forbidden'; END IF;
      -- Global lock serializes cooperating role mutations, including absent rows.
      PERFORM pg_catalog.pg_advisory_xact_lock(1936418663, 1919050083);
      SELECT r.role INTO actor_role FROM public.user_roles r WHERE r.user_id=actor_id;
      IF actor_role IS NULL OR actor_role NOT IN ('owner','admin') THEN RETURN 'forbidden'; END IF;
      SELECT r.role, r.role_revision INTO stored_role, revision FROM public.user_roles r WHERE r.user_id=target_id;
      IF stored_role = 'owner' OR (actor_role = 'admin' AND (stored_role = 'admin' OR requested_role = 'admin')) THEN RETURN 'forbidden'; END IF;
      IF stored_role::text IS DISTINCT FROM expected_role OR revision IS DISTINCT FROM expected_revision THEN RETURN 'stale_state'; END IF;
      SELECT true INTO found_target FROM neon_auth."user" u WHERE u.id=target_id::uuid FOR KEY SHARE;
      IF found_target IS DISTINCT FROM true THEN RETURN 'not_found'; END IF;
      IF COALESCE(stored_role::text,'player') = requested_role THEN RETURN 'no_change'; END IF;
      IF stored_role IS NULL THEN
        INSERT INTO public.user_roles(user_id,role,role_revision) VALUES (target_id,requested_role::public.app_role,1);
      ELSE
        UPDATE public.user_roles SET role=requested_role::public.app_role, role_revision=role_revision+1, updated_at=pg_catalog.now() WHERE user_id=target_id;
      END IF;
      INSERT INTO public.role_assignment_audit(actor_type,actor_user_id,target_user_id,action,previous_role,new_role,operator_reference)
        VALUES ('authenticated_admin',actor_id,target_id,'role_assignment',stored_role,requested_role::public.app_role,NULL);
      RETURN 'success';
    END
    $body$
  $create$;
  EXECUTE 'REVOKE ALL ON FUNCTION skg_private.assign_application_role(text,text,text,text,bigint) FROM PUBLIC';
  EXECUTE 'GRANT USAGE ON SCHEMA skg_private TO skg_role_writer';
  EXECUTE 'GRANT EXECUTE ON FUNCTION skg_private.assign_application_role(text,text,text,text,bigint) TO skg_role_writer';
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f',p.proowner))) a
    WHERE p.oid='skg_private.assign_application_role(text,text,text,text,bigint)'::regprocedure
      AND (a.grantee NOT IN (p.proowner, 'skg_role_writer'::regrole) OR a.is_grantable AND a.grantee <> p.proowner)
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace n
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
    WHERE n.nspname='skg_private'
      AND (a.grantee NOT IN (n.nspowner,'skg_role_writer'::regrole) OR (a.grantee='skg_role_writer'::regrole AND (a.privilege_type <> 'USAGE' OR a.is_grantable)))
  ) THEN RAISE EXCEPTION 'Unexpected default privileges on private role engine'; END IF;
END
$migration$;
