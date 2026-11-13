CREATE TABLE "role_assignment_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" text,
	"operator_reference" text,
	"target_user_id" text NOT NULL,
	"previous_role" "app_role",
	"new_role" "app_role" NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_audit_operator_reference_check" CHECK ("role_assignment_audit"."operator_reference" IS NULL OR "role_assignment_audit"."operator_reference" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
	CONSTRAINT "role_audit_source_check" CHECK ((
    "role_assignment_audit"."actor_type" = 'system_bootstrap' AND "role_assignment_audit"."actor_user_id" IS NULL
    AND "role_assignment_audit"."operator_reference" IS NOT NULL AND "role_assignment_audit"."action" = 'owner_bootstrap'
    AND "role_assignment_audit"."new_role" = 'owner' AND ("role_assignment_audit"."previous_role" IS NULL OR "role_assignment_audit"."previous_role" = 'player')
  ) OR (
    "role_assignment_audit"."actor_type" = 'authenticated_admin' AND "role_assignment_audit"."actor_user_id" IS NOT NULL
    AND "role_assignment_audit"."action" = 'role_assignment'
  ))
);
--> statement-breakpoint
ALTER TABLE "role_assignment_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "role_audit_initial_owner_uq" ON "role_assignment_audit" USING btree ("action") WHERE "role_assignment_audit"."action" = 'owner_bootstrap';
--> statement-breakpoint
REVOKE ALL ON TABLE "public"."role_assignment_audit" FROM PUBLIC;
