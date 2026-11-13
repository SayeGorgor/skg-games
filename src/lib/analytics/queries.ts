import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireAnalyticsAdmin } from "./access";
import { parseReportingDays, reportingWindow } from "./window";

// Canonicalize all completed records before verification and time filtering.
// Owner precedence matches claimed progress: current account, anonymous ID, row.
export function analyticsQuery(window: ReturnType<typeof reportingWindow>) {
  return sql`
    WITH source AS (
      SELECT a.id, a.user_id, a.game_slug, a.mode, a.verified, a.solved,
        a.moves, a.duration_ms, a.completed_at,
        coalesce(a.client_event_id, a.id)::text AS event_id,
        CASE WHEN a.user_id IS NOT NULL THEN jsonb_build_array('account', a.user_id)
          WHEN a.anonymous_id IS NOT NULL THEN jsonb_build_array('anonymous', a.anonymous_id)
          ELSE jsonb_build_array('row', a.id) END AS owner_key,
        CASE WHEN a.game_slug = 'perfect-stack' AND a.variant IN ('small','medium','hard')
          THEN a.variant ELSE 'default' END AS difficulty,
        coalesce(a.challenge_date, c.challenge_date)::text AS challenge_date,
        a.challenge_number
      FROM game_attempts a
      LEFT JOIN daily_challenges c ON c.id = a.challenge_id
      WHERE a.status = 'completed'
        AND (a.game_slug = 'perfect-stack' OR (a.game_slug = 'daily-alibi' AND a.mode = 'daily'))
    ), ranked AS (
      SELECT *, row_number() OVER (
        PARTITION BY owner_key, game_slug, mode,
          CASE WHEN mode = 'practice' THEN jsonb_build_array('event', event_id)
            WHEN challenge_date IS NOT NULL THEN jsonb_build_array('date', challenge_date, difficulty)
            ELSE jsonb_build_array('legacy', challenge_number,
              coalesce(to_char(completed_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD'), event_id), difficulty)
          END
        ORDER BY CASE WHEN game_slug = 'perfect-stack' THEN moves END ASC NULLS LAST,
          completed_at ASC NULLS LAST, event_id ASC
      ) AS rank
      FROM source
    ), qualifying AS (
      SELECT *, to_char(completed_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') AS day
      FROM ranked WHERE rank = 1 AND verified = true
        AND completed_at >= (${window.startDate}::date::timestamp AT TIME ZONE 'America/New_York')
        AND completed_at < (${window.endDate}::date::timestamp AT TIME ZONE 'America/New_York')
    )
    SELECT 'overview' AS dimension, 'all' AS key, count(*)::text AS results,
      count(*) FILTER (WHERE solved)::text AS solves,
      count(DISTINCT user_id)::text AS accounts,
      NULL::float8 AS average_moves, NULL::float8 AS average_duration_ms
    FROM qualifying
    UNION ALL
    SELECT 'day', day, count(*)::text, count(*) FILTER (WHERE solved)::text,
      NULL, NULL::float8, NULL::float8 FROM qualifying GROUP BY day
    UNION ALL
    SELECT 'game', game_slug, count(*)::text, count(*) FILTER (WHERE solved)::text,
      NULL, NULL::float8, NULL::float8 FROM qualifying GROUP BY game_slug
    UNION ALL
    SELECT 'mode', mode::text, count(*)::text, count(*) FILTER (WHERE solved)::text,
      NULL, NULL::float8, NULL::float8 FROM qualifying GROUP BY mode
    UNION ALL
    SELECT 'difficulty', difficulty, count(*)::text, count(*) FILTER (WHERE solved)::text,
      NULL,
      avg(moves) FILTER (WHERE solved AND moves BETWEEN 0 AND 1000000)::float8,
      avg(duration_ms) FILTER (WHERE solved AND duration_ms BETWEEN 0 AND 2147483647)::float8
    FROM qualifying WHERE game_slug = 'perfect-stack' GROUP BY difficulty
  `;
}
type AggregateRow = {
  dimension: string;
  key: string;
  results: string;
  solves: string;
  accounts: string | null;
  average_moves: number | null;
  average_duration_ms: number | null;
};
export type AnalyticsData = {
  window: ReturnType<typeof reportingWindow>;
  overview: { results: number; solves: number; accounts: number };
  trend: { date: string; results: number }[];
  games: { key: string; label: string; results: number; solves: number }[];
  modes: { key: string; label: string; results: number }[];
  difficulties: {
    key: string;
    label: string;
    results: number;
    averageMoves: number | null;
    averageDurationMs: number | null;
  }[];
  alibiSolveRate: number | null;
};

export async function readAnalytics(
  rawDays: unknown,
): Promise<AnalyticsData | null> {
  await requireAnalyticsAdmin();
  const days = parseReportingDays(rawDays);
  if (days === null) return null;
  const db = getDb();
  if (!db) throw new Error("Analytics unavailable");
  const window = reportingWindow(days);
  const { rows } = await db.execute<AggregateRow>(analyticsQuery(window));
  // Map a fixed set of aggregate fields only. No owner keys or raw results return.
  const find = (dimension: string, key: string) =>
    rows.find((r) => r.dimension === dimension && r.key === key);
  const overview = find("overview", "all");
  const games = [
    ["perfect-stack", "Perfect Stack"],
    ["daily-alibi", "Daily Alibi"],
  ].map(([key, label]) => {
    const row = find("game", key);
    return {
      key,
      label,
      results: Number(row?.results ?? 0),
      solves: Number(row?.solves ?? 0),
    };
  });
  const alibi = games[1];
  return {
    window,
    overview: {
      results: Number(overview?.results ?? 0),
      solves: Number(overview?.solves ?? 0),
      accounts: Number(overview?.accounts ?? 0),
    },
    trend: window.dates.map((date) => ({
      date,
      results: Number(find("day", date)?.results ?? 0),
    })),
    games,
    modes: [
      ["daily", "Daily"],
      ["practice", "Practice"],
    ].map(([key, label]) => ({
      key,
      label,
      results: Number(find("mode", key)?.results ?? 0),
    })),
    difficulties: [
      ["small", "Small"],
      ["medium", "Medium"],
      ["hard", "Hard"],
      ["default", "Unspecified legacy"],
    ].map(([key, label]) => {
      const row = find("difficulty", key);
      return {
        key,
        label,
        results: Number(row?.results ?? 0),
        averageMoves:
          row?.average_moves == null ? null : Number(row.average_moves),
        averageDurationMs:
          row?.average_duration_ms == null
            ? null
            : Number(row.average_duration_ms),
      };
    }),
    alibiSolveRate: alibi.results ? alibi.solves / alibi.results : null,
  };
}
