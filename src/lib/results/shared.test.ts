import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dailyStreak,
  dateOnly,
  parseResult,
  resultKey,
  summarize,
  uniqueHistory,
  type GameResult,
  type HistoryResult,
} from "./shared";
const date = "2026-11-03";
export const fixture = (patch: Partial<GameResult> = {}): GameResult => ({
  eventId: crypto.randomUUID(),
  gameSlug: "daily-alibi",
  mode: "daily",
  challengeDate: date,
  challengeNumber: 127,
  completedAt: "2026-11-03T15:00:00.000Z",
  solved: true,
  moves: null,
  durationMs: null,
  result: { suspect: "ava" },
  ...patch,
});
const history = (patch: Partial<GameResult> = {}): HistoryResult => ({
  ...fixture(patch),
  verified: false,
});
beforeEach(() => vi.useFakeTimers({ now: new Date("2026-11-03T16:00:00Z") }));
afterEach(() => vi.useRealTimers());
describe("completion contracts and personal statistics", () => {
  it("validates dates without throwing and requires complete results", () => {
    expect(dateOnly("2026-99-99")).toBe(false);
    expect(dateOnly("2026-02-30")).toBe(false);
    expect(parseResult(fixture())).toBeTruthy();
    for (const patch of [
      { gameSlug: "toString" },
      { moves: -1 },
      { durationMs: Infinity },
      { completedAt: "not a date" },
      { challengeDate: "2026-11-04" },
      { eventId: "invalid" },
      { mode: "abandoned" },
    ])
      expect(parseResult({ ...fixture(), ...patch })).toBeNull();
  });
  it("strips supplied identity, scores, and unknown metadata", () => {
    const parsed = parseResult({
      ...fixture(),
      userId: "victim",
      result: { suspect: "ava", score: 100000 },
      difficulty: "forged",
    });
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed?.result).toEqual({ suspect: "ava" });
    expect(parsed?.difficulty).toBeUndefined();
  });
  it("deduplicates daily completions, retains the first accusation, and permits practice sessions", () => {
    const first = history({
      solved: false,
      completedAt: "2026-11-03T13:00:00Z",
    });
    expect(uniqueHistory([history(), first])).toEqual([first]);
    const p = {
      mode: "practice" as const,
      challengeDate: null,
      challengeNumber: null,
    };
    expect(uniqueHistory([history(p), history(p)])).toHaveLength(2);
    expect(resultKey(fixture())).toBe(resultKey(fixture()));
  });
  it("does not combine Stack completions with Alibi win rates", () => {
    const summary = summarize([
      history(),
      history({ challengeDate: "2026-11-02", solved: false }),
      history({
        gameSlug: "perfect-stack",
        difficulty: "small",
        moves: 9,
        durationMs: 60000,
      }),
      history({
        gameSlug: "perfect-stack",
        difficulty: "hard",
        moves: 20,
        durationMs: 120000,
      }),
    ]);
    expect(summary.total).toBe(4);
    expect(summary.alibiWon).toBe(1);
    expect(summary.alibiPlayed).toBe(2);
    expect(summary.byGame[1].difficulties[0].fewestMoves).toBe(9);
    expect(summary.byGame[1].difficulties[2].averageMs).toBe(120000);
  });
  it("counts puzzle dates once, across DST and UTC completion boundaries", () => {
    const rows = [
      history({
        challengeDate: "2026-11-01",
        completedAt: "2026-11-02T03:59:00Z",
      }),
      history({ challengeDate: "2026-11-02" }),
      history({ challengeDate: "2026-11-02", difficulty: "small" }),
    ];
    expect(dailyStreak(rows, date)).toEqual({ current: 2, longest: 2 });
    expect(dailyStreak(rows, "2026-11-04")).toEqual({ current: 0, longest: 2 });
    expect(
      dailyStreak([...rows, history({ solved: false })], date).current,
    ).toBe(0);
  });
  it("handles empty history", () => {
    expect(summarize([])).toMatchObject({
      total: 0,
      games: 0,
      alibiPlayed: 0,
      alibiWon: 0,
    });
  });
});
