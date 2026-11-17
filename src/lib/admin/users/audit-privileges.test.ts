import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

it("existing audit migration denies an isolated unprivileged role, while table owner remains trusted", async () => {
  const pg = new PGlite();
  try {
    for (const file of [
      "0006_application_roles.sql",
      "0007_role_assignment_audit.sql",
    ])
      await pg.exec(
        readFileSync(`drizzle/${file}`, "utf8").replaceAll(
          "--> statement-breakpoint",
          "",
        ),
      );
    await pg.exec(`CREATE ROLE isolated_role_reader;
      GRANT USAGE ON SCHEMA public TO isolated_role_reader;
      GRANT SELECT ON public.user_roles TO isolated_role_reader;
      INSERT INTO public.role_assignment_audit(actor_type,actor_user_id,target_user_id,new_role,action)
      VALUES ('authenticated_admin','synthetic-actor','synthetic-target','analyst','role_assignment');
      SET ROLE isolated_role_reader;`);
    for (const sql of [
      "SELECT * FROM public.role_assignment_audit",
      "DELETE FROM public.role_assignment_audit",
      "UPDATE public.role_assignment_audit SET new_role='player'",
      "INSERT INTO public.role_assignment_audit(actor_type,actor_user_id,target_user_id,new_role,action) VALUES ('authenticated_admin','a','b','analyst','role_assignment')",
      "INSERT INTO public.user_roles(user_id,role) VALUES ('b','admin')",
    ])
      await expect(pg.exec(sql)).rejects.toThrow(/permission denied/);
    await pg.exec("RESET ROLE");
    const result = await pg.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM public.role_assignment_audit",
    );
    expect(result.rows[0].count).toBe(1);
  } finally {
    await pg.close();
  }
}, 30000);
