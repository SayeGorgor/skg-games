import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { generateStackPuzzle } from "../games/perfect-stack/generator";
import { getPracticeStackSeed, placeCells } from "../games/perfect-stack";
import {
  saveStackHandoff,
  readStackHandoff,
  clearStackHandoff,
} from "./game-handoff";
const generated = generateStackPuzzle(
  "small",
  getPracticeStackSeed("handoff", "small"),
);
const puzzle = { ...generated.publicPuzzle, seed: "handoff" };
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("restores only a matching puzzle's valid unfinished state and clears the transient snapshot", () => {
  const placement = generated.canonicalSolution[0];
  const state = {
    placements: [placement],
    rotations: { [placement.pieceId]: placement.rotation },
    moves: 1,
    seconds: 42,
    selected: placement.pieceId,
  };
  saveStackHandoff(puzzle, state);
  expect(readStackHandoff(puzzle)).toEqual(state);
  expect(readStackHandoff({ ...puzzle, seed: "different" })).toBeNull();
  clearStackHandoff(puzzle);
  expect(readStackHandoff(puzzle)).toBeNull();
});
it("rejects malformed and overlapping placements rather than restoring an invalid board", () => {
  const piece = puzzle.pieces[0],
    placement = {
      pieceId: piece.id,
      rotation: 0,
      anchor: [0, 0] as [number, number],
      cells: placeCells(piece, [0, 0], 0),
    };
  saveStackHandoff(puzzle, {
    placements: [placement, placement],
    rotations: {},
    moves: 2,
    seconds: 3,
    selected: piece.id,
  });
  expect(readStackHandoff(puzzle)).toBeNull();
  saveStackHandoff(puzzle, {
    placements: [{ ...placement, cells: [[99, 99]] }],
    rotations: {},
    moves: 1,
    seconds: 3,
    selected: piece.id,
  });
  expect(readStackHandoff(puzzle)).toBeNull();
});
