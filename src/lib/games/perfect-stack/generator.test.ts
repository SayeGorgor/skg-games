import { describe, it, expect } from "vitest";
import {
  STACK_DIFFICULTIES,
  canonicalRotationKey,
  getDailyStackSeed,
  getPracticeStackSeed,
  getStackStars,
  isStackSolved,
  rotateCells,
  shapeKey,
  type StackDifficulty,
} from "../perfect-stack";
import { generatePolyominoes } from "./polyominoes";
import { generateStackPuzzle, fingerprintStackPuzzle } from "./generator";
import { countSolutions } from "./solver";
describe("one-sided polyominoes", () => {
  for (const [size, count] of [
    [4, 7],
    [5, 18],
    [6, 60],
  ])
    it(`${size} cells: ${count} shapes`, () =>
      expect(generatePolyominoes(size)).toHaveLength(count));
  it("rotations canonicalize, reflections remain distinct", () => {
    const l: [number, number][] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ];
    expect(canonicalRotationKey(l)).toBe(canonicalRotationKey(rotateCells(l)));
    expect(canonicalRotationKey(l)).not.toBe(
      canonicalRotationKey(l.map(([r, c]) => [r, -c])),
    );
  });
});
for (const difficulty of Object.keys(STACK_DIFFICULTIES) as StackDifficulty[])
  describe(difficulty, () => {
    it("has expected dimensions, composition and a valid complete tiling", () => {
      const g = generateStackPuzzle(difficulty, "test-seed"),
        p = g.publicPuzzle,
        c = STACK_DIFFICULTIES[difficulty];
      expect([p.rows, p.cols, p.pieces.length]).toEqual(
        difficulty === "small"
          ? [5, 5, 5]
          : difficulty === "medium"
            ? [6, 6, 8]
            : [8, 8, 13],
      );
      expect(p.pieces.map((x) => x.cells.length)).toEqual(c.pieceSizes);
      expect(p.pieces.reduce((n, x) => n + x.cells.length, 0)).toBe(
        p.rows * p.cols,
      );
      expect(isStackSolved(p, g.canonicalSolution)).toBe(true);
      expect(isStackSolved(p, g.canonicalSolution.slice(1))).toBe(false);
      expect(JSON.stringify(p)).not.toContain("canonicalSolution");
      expect(generateStackPuzzle(difficulty, "test-seed")).toEqual(g);
      expect(
        fingerprintStackPuzzle({ ...p, pieces: [...p.pieces].reverse() }),
      ).toBe(g.fingerprint);
      const counted = countSolutions(p, 2, 50);
      expect(counted.nodesVisited).toBeLessThanOrEqual(51);
      expect(counted.count).toBeLessThanOrEqual(2);
      expect(shapeKey(p.pieces[0].cells)).toBeTruthy();
    }, 30000);
  });
it("separates namespaces and produces varied practice puzzles", () => {
  expect(getDailyStackSeed("2026-10-26", "small")).not.toBe(
    getPracticeStackSeed("2026-10-26", "small"),
  );
  const fingerprints = ["a", "b", "c", "d"].map(
    (seed) =>
      generateStackPuzzle("small", getPracticeStackSeed(seed, "small"))
        .fingerprint,
  );
  expect(new Set(fingerprints).size).toBeGreaterThan(1);
});
it("scores only extra placements", () => {
  expect(getStackStars(8, 8)).toBe(3);
  expect(getStackStars(10, 8)).toBe(2);
  expect(getStackStars(11, 8)).toBe(1);
});
