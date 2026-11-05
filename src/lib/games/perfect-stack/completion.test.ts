import { expect, it, beforeEach, afterEach, vi } from "vitest";
import { generateStackPuzzle } from "./generator";
import {
  validCompletedStackPlacements,
  matchesAccountCompletion,
  type AccountStackCompletion,
} from "./completion";
import {
  getRestoredDailyStackState,
  getStackDailyProgress,
  markStackDailySolved,
  isStackDailyComplete,
} from "../../client-progress";
import { stackAccountCacheKey } from "./completion";
const generated = generateStackPuzzle("small", "cross-device-test", {
  mode: "daily",
  challengeDate: "2026-11-04",
  challengeNumber: 137,
});
const puzzle = generated.publicPuzzle;
const result: AccountStackCompletion = {
  completed: true,
  eventId: crypto.randomUUID(),
  challengeNumber: 137,
  puzzleSeed: puzzle.seed,
  generatorVersion: 2,
  moves: 7,
  durationMs: 122000,
  stars: 2,
  completedAt: "2026-11-04T15:00:00Z",
  placements: generated.canonicalSolution,
};
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("validates exact placements, rotation and both historical/live anchor conventions", () => {
  expect(
    validCompletedStackPlacements(puzzle, generated.canonicalSolution),
  ).toBe(true);
  for (const mutate of [
    (p: typeof generated.canonicalSolution) => {
      p[0].rotation = 9;
    },
    (p: typeof generated.canonicalSolution) => {
      p[0].anchor = [99, 99];
    },
    (p: typeof generated.canonicalSolution) => {
      p[0].pieceId = "other-puzzle";
    },
    (p: typeof generated.canonicalSolution) => {
      p[1] = p[0];
    },
    (p: typeof generated.canonicalSolution) => {
      p[0].cells[0] = [-1, 0];
    },
  ]) {
    const bad = structuredClone(generated.canonicalSolution);
    mutate(bad);
    expect(validCompletedStackPlacements(puzzle, bad)).toBe(false);
  }
});
it("rejects mismatched identity and legacy snapshots without inventing a board", () => {
  expect(matchesAccountCompletion(puzzle, result)).toBe(true);
  for (const change of [
    { puzzleSeed: "other" },
    { generatorVersion: 1 },
    { challengeNumber: 900 },
    { placements: null },
  ])
    expect(matchesAccountCompletion(puzzle, { ...result, ...change })).toBe(
      false,
    );
});
it("keeps account caches and anonymous final boards independent", () => {
  const saved = {
    solved: true as const,
    moves: 7,
    durationMs: 122000,
    stars: 2 as const,
    puzzleSeed: puzzle.seed,
    placements: generated.canonicalSolution,
    completedAt: result.completedAt!,
  };
  markStackDailySolved("2026-11-04", "small", saved, puzzle, "account-A");
  expect(
    getRestoredDailyStackState(
      puzzle,
      getStackDailyProgress("2026-11-04", "account-A"),
    ),
  ).toEqual(saved);
  expect(getStackDailyProgress("2026-11-04", "account-B").difficulties).toEqual(
    {},
  );
  expect(getStackDailyProgress("2026-11-04").difficulties).toEqual({});
  markStackDailySolved("2026-11-04", "small", { ...saved, moves: 9 }, puzzle);
  expect(
    getStackDailyProgress("2026-11-04", "account-A").difficulties.small?.moves,
  ).toBe(7);
});
it("credits any completed difficulty from only the matching account's confirmed response", () => {
  localStorage.setItem(
    stackAccountCacheKey("account-A", "2026-11-04"),
    JSON.stringify({
      accountKey: "account-A",
      challengeDate: "2026-11-04",
      difficulties: { small: null, medium: result, hard: null },
    }),
  );
  expect(isStackDailyComplete("2026-11-04", "account-A")).toBe(true);
  expect(isStackDailyComplete("2026-11-04", "account-B")).toBe(false);
  expect(isStackDailyComplete("2026-11-04")).toBe(false);
});
