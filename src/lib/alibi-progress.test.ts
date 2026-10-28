import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  getAnonymousId,
  getDailyAlibiResult,
  getLocalProgress,
  getRestoredDailyAlibiState,
  isDailyAlibiComplete,
  markLocalSolved,
  saveDailyAlibiResult,
} from "./client-progress";
import {
  dailyAlibi,
  fingerprintAlibiCase,
  type DailyAlibiCase,
} from "./games/alibi";
import { getGameDate } from "./game-date";
const puzzle: DailyAlibiCase = { ...dailyAlibi, challengeDate: getGameDate() };
const key = "skg-progress-v1";
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());
it.each(dailyAlibi.suspects)(
  "restores $name using the current canonical outcome and explanation",
  (suspect) => {
    const saved = saveDailyAlibiResult(puzzle, suspect.key)!;
    expect(saved.accusedSuspectId).toBe(suspect.key);
    expect(saved.completed).toBe(true);
    expect(saved.puzzleFingerprint).toBe(fingerprintAlibiCase(puzzle));
    expect(getRestoredDailyAlibiState(puzzle)?.accused).toEqual(suspect);
    expect(isDailyAlibiComplete(puzzle.challengeDate)).toBe(true);
    expect(getLocalProgress().alibiSolved).toBe(suspect.correct);
    expect(JSON.stringify(saved)).not.toContain(suspect.explanation);
    expect(saved).not.toHaveProperty("correct");
  },
);
it("keeps the first final accusation immutable, including an incorrect one", () => {
  const first = saveDailyAlibiResult(puzzle, "marcus");
  const raw = localStorage.getItem(key);
  expect(saveDailyAlibiResult(puzzle, "ava")).toEqual(first);
  expect(localStorage.getItem(key)).toBe(raw);
  expect(getRestoredDailyAlibiState(puzzle)?.accused.key).toBe("marcus");
});
it("does not save a mere selection or an unknown suspect", () => {
  expect(getDailyAlibiResult(puzzle.challengeDate)).toBeNull();
  expect(saveDailyAlibiResult(puzzle, "unknown")).toBeNull();
  expect(localStorage.getItem(key)).toBeNull();
});
it("isolates date, challenge number and changed canonical case contents", () => {
  saveDailyAlibiResult(puzzle, "ava");
  for (const changed of [
    { ...puzzle, challengeDate: "2099-01-01" },
    { ...puzzle, challengeNumber: 999 },
    { ...puzzle, brief: puzzle.brief + " Updated." },
    {
      ...puzzle,
      suspects: puzzle.suspects.map((s) => ({
        ...s,
        explanation: s.explanation + " Updated.",
      })),
    },
  ])
    expect(getRestoredDailyAlibiState(changed)).toBeNull();
  expect(
    fingerprintAlibiCase({
      ...puzzle,
      suspects: [...puzzle.suspects].reverse(),
    }),
  ).toBe(fingerprintAlibiCase(puzzle));
});
it("preserves prior dates, unrelated progress and the anonymous user ID", () => {
  localStorage.setItem(
    key,
    JSON.stringify({ stackSolved: true, unrelated: "keep" }),
  );
  localStorage.setItem("skg-stack-progress-v2", '{"keep":"unchanged"}');
  const anonymousId = getAnonymousId();
  saveDailyAlibiResult(puzzle, "ava");
  const first = getDailyAlibiResult(puzzle.challengeDate);
  saveDailyAlibiResult({ ...puzzle, challengeDate: "2099-01-01" }, "nina");
  expect(getDailyAlibiResult(puzzle.challengeDate)).toEqual(first);
  expect(JSON.parse(localStorage.getItem(key)!).unrelated).toBe("keep");
  expect(localStorage.getItem("skg-stack-progress-v2")).toBe(
    '{"keep":"unchanged"}',
  );
  expect(getAnonymousId()).toBe(anonymousId);
  markLocalSolved("stack");
  expect(getDailyAlibiResult(puzzle.challengeDate)).toEqual(first);
});
it("does not credit a dated solved flag on another Daily date", () => {
  saveDailyAlibiResult({ ...puzzle, challengeDate: "2020-01-01" }, "ava");
  expect(getLocalProgress().alibiSolved).toBe(false);
  expect(getDailyAlibiResult(puzzle.challengeDate)).toBeNull();
});
it("tolerates legacy, missing, stale and malformed local progress", () => {
  const valid = saveDailyAlibiResult(puzzle, "ava")!;
  const badEntries = [
    { completed: true },
    { ...valid, accusedSuspectId: "missing" },
    { ...valid, accusedSuspectId: 42 },
    { ...valid, completed: false },
    { ...valid, schemaVersion: 99 },
    { ...valid, puzzleFingerprint: "stale" },
    { ...valid, completedAt: "bad-date" },
    { ...valid, challengeNumber: -1 },
  ];
  for (const result of badEntries) {
    localStorage.setItem(
      key,
      JSON.stringify({ dailyAlibiResults: { [puzzle.challengeDate]: result } }),
    );
    expect(getRestoredDailyAlibiState(puzzle)).toBeNull();
  }
  for (const raw of [
    "null",
    "[]",
    '"text"',
    "{bad-json",
    JSON.stringify({ alibiSolved: true }),
  ]) {
    localStorage.setItem(key, raw);
    expect(getRestoredDailyAlibiState(puzzle)).toBeNull();
  }
  expect(getLocalProgress().alibiSolved).toBe(true);
});
it("reads restoration without writing or recording completion again", () => {
  saveDailyAlibiResult(puzzle, "nina");
  const original = localStorage.getItem(key);
  const setter = vi.spyOn(localStorage, "setItem");
  expect(getRestoredDailyAlibiState(puzzle)?.accused.key).toBe("nina");
  expect(getLocalProgress().alibiSolved).toBe(false);
  expect(setter).not.toHaveBeenCalled();
  expect(localStorage.getItem(key)).toBe(original);
});
