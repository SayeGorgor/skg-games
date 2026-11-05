import { neon } from "@neondatabase/serverless";
import { getGameDate } from "../../game-date";
import type { CuratedAlibiCase } from "./types";
import {
  alibiCoverage,
  planAlibiDailies,
  type AlibiAssignment,
  type PlannedAlibi,
} from "./scheduling";
import { getAlibiCaseFingerprint } from "./validation";

export function requireAlibiDatabaseUrl(value = process.env.DATABASE_URL) {
  if (!value) throw new Error("DATABASE_URL is required.");
  return value;
}
export function createAlibiSeedStore(url: string) {
  const sql = neon(requireAlibiDatabaseUrl(url));
  return {
    async read(): Promise<AlibiAssignment[]> {
      const rows = await sql`
        SELECT d.challenge_date::text AS "challengeDate", d.challenge_number AS "challengeNumber",
          to_jsonb(a)->>'case_id' AS "caseId", to_jsonb(a)->>'fingerprint' AS fingerprint,
          (a.challenge_id IS NOT NULL AND
            (SELECT count(*) FROM alibi_clues c WHERE c.challenge_id=d.id) >= 4 AND
            (SELECT count(*) FROM alibi_suspects s WHERE s.challenge_id=d.id) = 4 AND
            (SELECT count(*) FROM alibi_suspects s WHERE s.challenge_id=d.id AND s.is_correct) = 1) AS complete,
          json_build_object('title',a.title,'dek',a.dek,'briefTitle',a.brief_title,'brief',a.brief,'objective',a.objective,
            'clues', (SELECT json_agg(c.clue ORDER BY c.clue_number) FROM alibi_clues c WHERE c.challenge_id=d.id),
            'suspects', (SELECT json_agg(json_build_object('key',s.suspect_key,'initial',left(s.name,1),
              'name',s.name,'role',s.role,'statement',s.statement,'correct',s.is_correct,'explanation',s.explanation))
              FROM alibi_suspects s WHERE s.challenge_id=d.id)) AS content
        FROM daily_challenges d JOIN games g ON g.id=d.game_id
        LEFT JOIN alibi_cases a ON a.challenge_id=d.id
        WHERE g.slug='daily-alibi' ORDER BY d.challenge_date`;
      return rows.map((r) => ({
        challengeDate: r.challengeDate,
        challengeNumber: r.challengeNumber,
        caseId: r.caseId,
        complete: r.complete,
        fingerprint:
          r.fingerprint ??
          (r.complete
            ? getAlibiCaseFingerprint(r.content as CuratedAlibiCase)
            : null),
      }));
    },
    async insert(plan: PlannedAlibi[], today: string): Promise<number> {
      if (!plan.length) return 0;
      // Only the real write path creates the catalog row; dry-run/status are SELECT-only.
      await sql`INSERT INTO games (slug,name,description) VALUES
        ('daily-alibi','Daily Alibi','Solve a compact daily mystery.') ON CONFLICT (slug) DO NOTHING`;
      const data = JSON.stringify(
        plan.map((p) => ({
          date: p.challengeDate,
          number: p.challengeNumber,
          caseId: p.entry.caseId,
          fingerprint: p.fingerprint,
          content: p.entry,
        })),
      );
      // The advisory lock is a separate statement so the following statement gets
      // a fresh READ COMMITTED snapshot after concurrent seeders have committed.
      // All challenge/case/clue/suspect rows are written in one atomic transaction.
      const [, inserted] = await sql.transaction([
        sql`SELECT pg_advisory_xact_lock(713084226)`,
        sql`
          WITH input AS (SELECT value AS p FROM jsonb_array_elements(${data}::jsonb)),
          game AS (SELECT id FROM games WHERE slug='daily-alibi'),
          eligible AS (
            SELECT p FROM input WHERE NOT EXISTS (
              SELECT 1 FROM daily_challenges d, game g WHERE d.game_id=g.id AND d.challenge_date=(p->>'date')::date)
          ),
          safe AS (
            SELECT p FROM eligible WHERE NOT EXISTS (
              SELECT 1 FROM eligible e JOIN alibi_cases a ON a.case_id=e.p->>'caseId' OR a.fingerprint=e.p->>'fingerprint')
          ),
          challenges AS (
            INSERT INTO daily_challenges (game_id,challenge_date,challenge_number,public_payload,solution_payload,published_at)
            SELECT g.id,(p->>'date')::date,(p->>'number')::integer,
              jsonb_build_object('caseId',p->>'caseId','fingerprint',p->>'fingerprint'), '{}'::jsonb,
              CASE WHEN (p->>'date')::date <= ${today}::date THEN now() ELSE NULL END
            FROM safe CROSS JOIN game g
            ON CONFLICT DO NOTHING RETURNING id,challenge_date
          ),
          cases AS (
            INSERT INTO alibi_cases (challenge_id,case_id,fingerprint,title,dek,brief_title,brief,objective)
            SELECT d.id,p->>'caseId',p->>'fingerprint',p->'content'->>'title',p->'content'->>'dek',
              p->'content'->>'briefTitle',p->'content'->>'brief',p->'content'->>'objective'
            FROM challenges d JOIN input ON d.challenge_date=(p->>'date')::date RETURNING challenge_id
          ),
          clues AS (
            INSERT INTO alibi_clues (challenge_id,clue_number,clue)
            SELECT d.id,c.ordinality::integer,c.value #>> '{}'
            FROM challenges d JOIN input ON d.challenge_date=(p->>'date')::date
            CROSS JOIN LATERAL jsonb_array_elements(p->'content'->'clues') WITH ORDINALITY c(value,ordinality)
          ),
          suspects AS (
            INSERT INTO alibi_suspects (challenge_id,suspect_key,name,role,statement,is_correct,explanation)
            SELECT d.id,s->>'key',s->>'name',s->>'role',s->>'statement',(s->>'correct')::boolean,s->>'explanation'
            FROM challenges d JOIN input ON d.challenge_date=(p->>'date')::date
            CROSS JOIN LATERAL jsonb_array_elements(p->'content'->'suspects') s
          ) SELECT challenge_id FROM cases`,
      ]);
      return inserted.length;
    },
  };
}
export type AlibiSeedStore = ReturnType<typeof createAlibiSeedStore>;
export async function seedAlibiDailies(
  store: AlibiSeedStore,
  catalog: CuratedAlibiCase[],
  options: { start: string; days: number; dryRun?: boolean },
) {
  const initial = await store.read();
  const plan = planAlibiDailies(catalog, initial, options.start, options.days);
  if (options.dryRun)
    return {
      inserted: 0,
      skipped: options.days - plan.length,
      planned: plan,
      coverage: alibiCoverage(catalog, initial),
    };
  let pending = plan,
    inserted = 0;
  for (let retry = 0; pending.length && retry < 3; retry++) {
    inserted += await store.insert(pending, getGameDate());
    pending = planAlibiDailies(
      catalog,
      await store.read(),
      options.start,
      options.days,
    );
  }
  if (pending.length)
    throw new Error(
      "Concurrent Daily Alibi scheduling conflict; rerun the command.",
    );
  return {
    inserted,
    skipped: options.days - inserted,
    planned: plan,
    coverage: alibiCoverage(catalog, await store.read()),
  };
}
