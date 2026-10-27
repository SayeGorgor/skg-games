import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  getLocalProgress,
  getStackDailyProgress,
  getRestoredDailyStackState,
  isStackDailyComplete,
  isValidPersistedStackSolution,
  markStackDailySolved,
  markLocalSolved,
  type RestoredDailyStackState,
} from "./client-progress";
import { getGameDate } from "./game-date";
import { generateStackPuzzle } from "./games/perfect-stack/generator";
import type { GeneratedStackPuzzle } from "./games/perfect-stack";

const date = getGameDate();
const small = generateStackPuzzle("small", "snapshot-small", {
  mode: "daily",
  challengeDate: date,
  challengeNumber: 128,
});
const medium = generateStackPuzzle("medium", "snapshot-medium", {
  mode: "daily",
  challengeDate: date,
  challengeNumber: 128,
});
function result(
  generated = small,
  overrides: Partial<RestoredDailyStackState> = {},
): RestoredDailyStackState {
  return {
    solved: true,
    puzzleSeed: generated.publicPuzzle.seed,
    placements: structuredClone(generated.canonicalSolution),
    moves: generated.publicPuzzle.pieceCount,
    durationMs: 81234,
    stars: 3,
    ...overrides,
  };
}
function writeRaw(value: unknown) {
  localStorage.setItem("skg-stack-progress-v2", JSON.stringify(value));
}
function save(
  generated: GeneratedStackPuzzle,
  overrides: Partial<RestoredDailyStackState> = {},
) {
  return markStackDailySolved(
    date,
    generated.publicPuzzle.difficulty,
    result(generated, overrides),
    generated.publicPuzzle,
  );
}
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());

it("saves and restores the exact board, rotations and original result metadata", () => {
  save(small);
  expect(getRestoredDailyStackState(small.publicPuzzle)).toEqual(result());
  expect(isStackDailyComplete(date)).toBe(true);
  expect(getLocalProgress().stackSolved).toBe(true);
});
it("merges independent difficulty snapshots without modifying the previous result", () => {
  const first = save(small);
  save(medium, { moves: 10, stars: 2, durationMs: 215230 });
  expect(getRestoredDailyStackState(small.publicPuzzle)).toEqual(result());
  expect(getRestoredDailyStackState(medium.publicPuzzle)).toEqual(
    result(medium, { moves: 10, stars: 2, durationMs: 215230 }),
  );
  expect(first.difficulties.medium).toBeUndefined();
  expect(getStackDailyProgress(date).difficulties.hard).toBeUndefined();
});
it("clones final placements on save and restoration", () => {
  const snapshot = result();
  const saved = markStackDailySolved(
    date,
    "small",
    snapshot,
    small.publicPuzzle,
  );
  snapshot.placements[0].anchor[0] = 99;
  snapshot.placements[0].cells[0][0] = 99;
  expect(saved.difficulties.small?.placements).toEqual(small.canonicalSolution);
  const restored = getRestoredDailyStackState(small.publicPuzzle)!;
  restored.placements[0].cells[0][0] = 99;
  expect(getRestoredDailyStackState(small.publicPuzzle)?.placements).toEqual(
    small.canonicalSolution,
  );
});
it("never restores a different seed, date, difficulty or Practice puzzle", () => {
  save(small);
  for (const puzzle of [
    { ...small.publicPuzzle, seed: "another-seed" },
    { ...small.publicPuzzle, challengeDate: "2099-01-01" },
    medium.publicPuzzle,
    { ...small.publicPuzzle, mode: "practice" as const },
  ]) {
    expect(getRestoredDailyStackState(puzzle)).toBeNull();
  }
  expect(
    getRestoredDailyStackState(small.publicPuzzle, {
      ...getStackDailyProgress(date),
      date: "2099-01-01",
    }),
  ).toBeNull();
});
it("handles legacy metadata as completion history, but not a frozen board", () => {
  writeRaw({
    [date]: {
      date,
      difficulties: {
        small: { solved: true, moves: 5, durationMs: 100000, stars: 3 },
      },
    },
  });
  expect(isStackDailyComplete(date)).toBe(true);
  expect(getRestoredDailyStackState(small.publicPuzzle)).toBeNull();
  save(small, { moves: 7, stars: 2 });
  expect(getRestoredDailyStackState(small.publicPuzzle)).toEqual(
    result(small, { moves: 7, stars: 2 }),
  );
});
it("keeps the best complete result for the same valid puzzle", () => {
  save(small);
  save(small, { stars: 1, moves: 20, durationMs: 1000 });
  expect(getRestoredDailyStackState(small.publicPuzzle)).toEqual(result());
});
it("replaces stale or invalid saved boards even when old metadata has better stars", () => {
  for (const bad of [
    result(small, { puzzleSeed: "old-seed" }),
    result(small, { placements: [] }),
    result(small, {
      placements: small.canonicalSolution.map(() => small.canonicalSolution[0]),
    }),
  ]) {
    writeRaw({ [date]: { date, difficulties: { small: bad } } });
    expect(getRestoredDailyStackState(small.publicPuzzle)).toBeNull();
    save(small, { stars: 2, moves: 7 });
    expect(getRestoredDailyStackState(small.publicPuzzle)?.stars).toBe(2);
  }
});
it("rejects missing, unknown, duplicate, overlapping, out-of-bounds and malformed placements", () => {
  const variants: unknown[] = [
    null,
    {},
    [],
    small.canonicalSolution.slice(1),
    [...small.canonicalSolution, small.canonicalSolution[0]],
  ];
  for (const change of [
    (p: RestoredDailyStackState["placements"]) => {
      p[0].pieceId = "unknown";
    },
    (p: RestoredDailyStackState["placements"]) => {
      p[0].pieceId = p[1].pieceId;
    },
    (p: RestoredDailyStackState["placements"]) => {
      p[0].cells[0] = p[1].cells[0];
    },
    (p: RestoredDailyStackState["placements"]) => {
      p[0].cells[0] = [-1, 0];
    },
    (p: RestoredDailyStackState["placements"]) => {
      p[0].cells[0] = [5, 0];
    },
    (p: RestoredDailyStackState["placements"]) => {
      p[0].cells.pop();
    },
    (p: RestoredDailyStackState["placements"]) => {
      p[0].rotation = 4;
    },
    (p: RestoredDailyStackState["placements"]) => {
      p[0].anchor = [99, 0];
    },
  ]) {
    const placements = structuredClone(small.canonicalSolution);
    change(placements);
    variants.push(placements);
  }
  variants.push([
    { pieceId: "piece-1", anchor: [0, 0], rotation: 0, cells: "bad" },
  ]);
  for (const placements of variants) {
    expect(isValidPersistedStackSolution(small.publicPuzzle, placements)).toBe(
      false,
    );
    writeRaw({
      [date]: { date, difficulties: { small: { ...result(), placements } } },
    });
    expect(getRestoredDailyStackState(small.publicPuzzle)).toBeNull();
  }
});
it("rejects corrupted result metadata and invalid JSON safely", () => {
  for (const value of [
    null,
    [],
    "text",
    { [date]: { date } },
    { [date]: { date, difficulties: { small: { ...result(), moves: -1 } } } },
    {
      [date]: {
        date,
        difficulties: {
          small: { ...result(), stars: { toString: null, valueOf: null } },
        },
      },
    },
    {
      [date]: {
        date,
        difficulties: { small: { ...result(), durationMs: -1 } },
      },
    },
  ]) {
    writeRaw(value);
    expect(getRestoredDailyStackState(small.publicPuzzle)).toBeNull();
  }
  localStorage.setItem("skg-stack-progress-v2", "{bad-json");
  expect(getStackDailyProgress(date)).toEqual({ date, difficulties: {} });
});
it("preserves Alibi and does not credit undated V1 Stack as today's completion", () => {
  localStorage.setItem(
    "skg-progress-v1",
    JSON.stringify({ alibiSolved: true, stackSolved: true }),
  );
  expect(getLocalProgress()).toEqual({ alibiSolved: true, stackSolved: false });
  markLocalSolved("alibi");
  markStackDailySolved("2020-01-01", "small", result());
  expect(getLocalProgress()).toEqual({ alibiSolved: true, stackSolved: false });
});
