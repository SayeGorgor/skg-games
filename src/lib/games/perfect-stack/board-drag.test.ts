import { describe, expect, it } from "vitest";
import {
  getStackDragCell,
  oriented,
  placeCells,
  validPlacement,
  type StackPiece,
} from "../perfect-stack";
import { generatePolyominoes } from "./polyominoes";

const grid = {
  left: 20,
  top: 30,
  cellWidth: 40,
  cellHeight: 40,
  columnGap: 6,
  rowGap: 6,
  rows: 8,
  cols: 8,
};

describe("board drag hit areas", () => {
  it("covers cell corners and both sides of every grid gap", () => {
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        for (const dx of [-2.9, 0, 20, 40, 42.9]) {
          for (const dy of [-2.9, 0, 20, 40, 42.9]) {
            expect(
              getStackDragCell(20 + col * 46 + dx, 30 + row * 46 + dy, grid),
            ).toEqual([row, col]);
          }
        }
      }
    }
  });

  it("rejects points outside the board hit area", () => {
    for (const [x, y] of [
      [16, 50],
      [387, 50],
      [40, 26],
      [40, 397],
    ]) {
      expect(getStackDragCell(x, y, grid)).toBeNull();
    }
  });

  it("moves every polyomino from every occupied cell in all rotations near every board edge", () => {
    for (const size of [4, 5, 6]) {
      for (const cells of generatePolyominoes(size)) {
        const piece: StackPiece = {
          id: "test",
          shapeId: "test",
          color: "blue",
          cells,
        };
        for (let rotation = 0; rotation < 4; rotation++) {
          const shape = oriented(piece, rotation);
          const maxR = Math.max(...shape.map(([r]) => r));
          const maxC = Math.max(...shape.map(([, c]) => c));
          for (const top of [0, 7 - maxR]) {
            for (const left of [0, 7 - maxC]) {
              const expected = shape.map(([r, c]) => [r + top, c + left]);
              for (const grabbed of shape) {
                const pointer = getStackDragCell(
                  grid.left + (left + grabbed[1]) * 46,
                  grid.top + (top + grabbed[0]) * 46,
                  grid,
                )!;
                const placed = placeCells(piece, pointer, rotation, grabbed);
                expect(placed).toEqual(expected);
                expect(validPlacement(grid, placed, [], piece.id)).toBe(true);
              }
            }
          }
        }
      }
    }
  });
});
