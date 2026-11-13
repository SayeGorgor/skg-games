import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("./access", () => ({ requireAnalyticsAdmin: vi.fn() }));
import { getDb } from "@/lib/db";
import { requireAnalyticsAdmin } from "./access";
import { analyticsQuery, readAnalytics } from "./queries";
import { parseReportingDays, reportingWindow } from "./window";
const pg = new PGlite();
const db = drizzle(pg);
beforeAll(async () => {
  for (const file of readdirSync("drizzle")
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort())
    await pg.exec(
      readFileSync(path.join("drizzle", file), "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
}, 30000);
beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T17:00:00Z"));
  vi.mocked(getDb).mockReturnValue(
    db as unknown as NonNullable<ReturnType<typeof getDb>>,
  );
  await pg.exec("DELETE FROM game_attempts");
});
afterEach(() => vi.useRealTimers());
afterAll(async () => {
  await pg.close();
});
type Attempt = {
  game?: string;
  owner?: string | null;
  anon?: string | null;
  date?: string | null;
  completed?: string | null;
  verified?: boolean;
  solved?: boolean;
  moves?: number | null;
  duration?: number | null;
  mode?: string;
  variant?: string | null;
  status?: string;
  event?: string | null;
};
async function insert(a: Attempt = {}) {
  const id = crypto.randomUUID();
  await pg.query(
    `INSERT INTO game_attempts(id,game_slug,user_id,anonymous_id,challenge_date,completed_at,verified,solved,moves,duration_ms,mode,variant,status,client_event_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id,
      a.game ?? "perfect-stack",
      a.owner === undefined ? "private-owner" : a.owner,
      a.anon ?? null,
      a.date === undefined ? "2026-11-12" : a.date,
      a.completed === undefined ? "2026-11-12T15:00:00Z" : a.completed,
      a.verified ?? true,
      a.solved ?? true,
      a.moves === undefined ? 10 : a.moves,
      a.duration === undefined ? 1000 : a.duration,
      a.mode ?? "daily",
      a.variant === undefined ? "small" : a.variant,
      a.status ?? "completed",
      a.event ?? null,
    ],
  );
  return id;
}
it("authorizes before reading data, even for invalid filters", async () => {
  vi.mocked(requireAnalyticsAdmin).mockRejectedValue(new Error("NOT_FOUND"));
  await expect(readAnalytics("7")).rejects.toThrow("NOT_FOUND");
  await expect(readAnalytics("bad")).rejects.toThrow("NOT_FOUND");
  expect(getDb).not.toHaveBeenCalled();
});
it("validates bounded filters and defaults to 30 days", async () => {
  expect(parseReportingDays(undefined)).toBe(30);
  for (const value of [
    "0",
    "365",
    "7; DROP TABLE game_attempts",
    ["7"],
    7,
    null,
    "",
  ]) {
    expect(parseReportingDays(value)).toBeNull();
    expect(await readAnalytics(value)).toBeNull();
  }
  expect(getDb).not.toHaveBeenCalled();
  expect((await readAnalytics(undefined))?.window.days).toBe(30);
});
it("returns bounded zero aggregates and no divide by zero for empty data", async () => {
  const data = (await readAnalytics("7"))!;
  expect(data.overview).toEqual({ results: 0, solves: 0, accounts: 0 });
  expect(data.trend).toHaveLength(7);
  expect(data.trend.every((row) => row.results === 0)).toBe(true);
  expect(data.alibiSolveRate).toBeNull();
  expect(data.difficulties[0].averageMoves).toBeNull();
});
it("distinguishes completed Alibi accusations from successful solves and keeps the first", async () => {
  await insert({
    game: "daily-alibi",
    solved: false,
    completed: "2026-11-12T14:00:00Z",
  });
  await insert({
    game: "daily-alibi",
    solved: true,
    completed: "2026-11-12T16:00:00Z",
  });
  await insert({ game: "daily-alibi", owner: "other-account", solved: true });
  const data = (await readAnalytics("7"))!;
  expect(data.overview).toEqual({ results: 2, solves: 1, accounts: 2 });
  expect(data.alibiSolveRate).toBe(0.5);
});
it("keeps best daily Stack runs and distinct practice events; computes valid solved measurements", async () => {
  await insert({ moves: 20, duration: 9000 });
  await insert({ moves: 7, duration: 2000, completed: "2026-11-12T16:00:00Z" });
  await insert({ mode: "practice", moves: 9, duration: 4000 });
  await insert({ mode: "practice", moves: 11, duration: null });
  await insert({ variant: "hard", moves: -1, duration: -3 });
  await insert({ variant: "medium", solved: false, moves: 99, duration: 9999 });
  const data = (await readAnalytics("7"))!;
  expect(data.overview).toEqual({ results: 5, solves: 4, accounts: 1 });
  expect(data.modes.map((row) => row.results)).toEqual([3, 2]);
  expect(data.difficulties[0]).toMatchObject({
    results: 3,
    averageMoves: 9,
    averageDurationMs: 3000,
  });
  expect(data.difficulties[1].averageMoves).toBeNull();
  expect(data.difficulties[2].averageMoves).toBeNull();
});
it("canonicalizes before verification and window filtering", async () => {
  await insert({
    game: "daily-alibi",
    verified: false,
    solved: false,
    completed: "2026-11-12T13:00:00Z",
  });
  await insert({
    game: "daily-alibi",
    verified: true,
    completed: "2026-11-12T14:00:00Z",
  });
  await insert({ moves: 5, completed: "2026-10-01T12:00:00Z" });
  await insert({ moves: 9 });
  expect((await readAnalytics("7"))!.overview.results).toBe(0);
});
it("excludes unverified, incomplete, undated, unknown games and unsupported modes", async () => {
  await insert({ verified: false });
  await insert({ status: "started", owner: "a" });
  await insert({ completed: null, owner: "b" });
  await insert({ game: "unknown-game" });
  await insert({ game: "daily-alibi", mode: "practice" });
  expect((await readAnalytics("7"))!.overview.results).toBe(0);
});
it("handles legacy dates and null variants without merging unrelated no-owner rows", async () => {
  await insert({ date: null, variant: null });
  await insert({ date: null, variant: "invalid-legacy" });
  await insert({ owner: null });
  await insert({ owner: null });
  const data = (await readAnalytics("7"))!;
  expect(data.overview).toEqual({ results: 3, solves: 3, accounts: 1 });
  expect(data.difficulties[3].results).toBe(1);
});
it("uses joined challenge dates for legacy rows", async () => {
  await pg.exec(`INSERT INTO games(slug,name,description) VALUES ('perfect-stack','Stack','test') ON CONFLICT DO NOTHING;
    INSERT INTO daily_challenges(game_id,challenge_date,challenge_number) SELECT id,'2026-11-12',999 FROM games WHERE slug='perfect-stack' ON CONFLICT DO NOTHING;`);
  const id = await insert({ date: null });
  await pg.query(
    `UPDATE game_attempts SET challenge_id=(SELECT id FROM daily_challenges WHERE challenge_number=999) WHERE id=$1`,
    [id],
  );
  await insert();
  expect((await readAnalytics("7"))!.overview.results).toBe(1);
});
it("uses current ownership after an anonymous-to-account transfer without counting an anonymous visitor", async () => {
  const anon = "12345678-1234-4123-8123-123456789abc";
  const id = await insert({ owner: null, anon });
  expect((await readAnalytics("7"))!.overview.accounts).toBe(0);
  await pg.query("UPDATE game_attempts SET user_id=$1 WHERE id=$2", [
    "claimed-owner",
    id,
  ]);
  await insert({ owner: "claimed-owner", moves: 12 });
  const data = (await readAnalytics("7"))!;
  expect(data.overview).toEqual({ results: 1, solves: 1, accounts: 1 });
  expect(JSON.stringify(data)).not.toMatch(
    /claimed-owner|private-owner|12345678|user_id|anonymous_id|puzzle_seed|client_event_id/,
  );
});
it("uses half-open completion windows and NY date grouping without date substitutions", async () => {
  await insert({ mode: "practice", completed: "2026-11-06T04:59:59Z" });
  await insert({ mode: "practice", completed: "2026-11-06T05:00:00Z" });
  await insert({ mode: "practice", completed: "2026-11-13T04:59:59Z" });
  await insert({ mode: "practice", completed: "2026-11-13T05:00:00Z" });
  await insert({ mode: "practice", completed: null });
  const data = (await readAnalytics("7"))!;
  expect(data.overview.results).toBe(2);
  expect(data.trend[0].results).toBe(1);
  expect(data.trend[6].results).toBe(1);
});
it.each([
  ["2026-03-08T16:00:00Z", 167],
  ["2026-11-01T17:00:00Z", 169],
])("handles DST windows for %s", async (now, hours) => {
  const window = reportingWindow(7, new Date(now));
  const result = await pg.query<{ hours: number }>(
    `SELECT extract(epoch FROM (($2::date::timestamp AT TIME ZONE 'America/New_York') - ($1::date::timestamp AT TIME ZONE 'America/New_York')))/3600 AS hours`,
    [window.startDate, window.endDate],
  );
  expect(Number(result.rows[0].hours)).toBe(hours);
  expect(window.dates).toHaveLength(7);
});
it("parameterizes dates and returns no identity columns from SQL", () => {
  const compiled = new PgDialect().sqlToQuery(
    analyticsQuery(reportingWindow(7)),
  );
  expect(compiled.params).toEqual(["2026-11-06", "2026-11-13"]);
  expect(compiled.sql).not.toContain("2026-11-06");
  expect(compiled.sql).not.toContain("a.result");
  expect(compiled.sql).not.toMatch(/INSERT|UPDATE|DELETE/);
});

it("uses Stack time and event-ID tie breakers and keeps null measurements out of averages", async () => {
  await insert({ moves: 7, duration: 3000, completed: "2026-11-12T16:00:00Z" });
  await insert({
    moves: 7,
    duration: 1000,
    completed: "2026-11-12T14:00:00Z",
    event: "00000000-0000-4000-8000-000000000001",
  });
  await insert({
    moves: 7,
    duration: 2000,
    completed: "2026-11-12T14:00:00Z",
    event: "00000000-0000-4000-8000-000000000002",
  });
  await insert({ moves: null, duration: null, variant: "hard" });
  const data = (await readAnalytics("7"))!;
  expect(data.overview.results).toBe(2);
  expect(data.difficulties[0]).toMatchObject({
    averageMoves: 7,
    averageDurationMs: 1000,
  });
  expect(data.difficulties[2]).toMatchObject({
    results: 1,
    averageMoves: null,
    averageDurationMs: null,
  });
});
