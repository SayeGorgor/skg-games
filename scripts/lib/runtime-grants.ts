// Operator/test tooling only. No runtime import or credentials.
export const runtimeGrants: Record<
  string,
  { select?: boolean; insert?: boolean; update?: readonly string[] }
> = {
  games: { select: true },
  daily_challenges: { select: true, update: ["published_at"] },
  alibi_cases: { select: true },
  alibi_clues: { select: true },
  alibi_suspects: { select: true },
  stack_puzzles: { select: true },
  game_attempts: {
    select: true,
    insert: true,
    update: ["user_id", "result", "puzzle_seed"],
  },
  user_profiles: {
    select: true,
    insert: true,
    update: ["email", "updated_at"],
  },
  anonymous_claims: { select: true, insert: true },
  subscriptions: { select: true },
  user_roles: { select: true },
  publish_runs: { insert: true },
};
export function runtimeGrantSql(): string {
  return Object.entries(runtimeGrants)
    .flatMap(([table, grants]) => {
      const sql: string[] = [];
      if (grants.select)
        sql.push(`GRANT SELECT ON TABLE public.${table} TO skg_app;`);
      if (grants.insert)
        sql.push(`GRANT INSERT ON TABLE public.${table} TO skg_app;`);
      if (grants.update)
        sql.push(
          `GRANT UPDATE (${grants.update.join(", ")}) ON TABLE public.${table} TO skg_app;`,
        );
      return sql;
    })
    .join("\n");
}
