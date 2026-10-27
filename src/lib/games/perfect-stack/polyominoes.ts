import {
  canonicalRotationKey,
  normalizeCells,
  type Cell,
} from "../perfect-stack";
const cache = new Map<number, Cell[][]>();
export function generatePolyominoes(size: number): Cell[][] {
  if (!Number.isInteger(size) || size < 1 || size > 6)
    throw new Error("Supported polyomino size: 1–6");
  if (cache.has(size)) return structuredClone(cache.get(size)!);
  let shapes: Cell[][] = [[[0, 0]]];
  for (let n = 1; n < size; n++) {
    const next = new Map<string, Cell[]>();
    for (const cells of shapes)
      for (const [r, c] of cells)
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const cell: Cell = [r + dr, c + dc];
          if (cells.some((x) => x[0] === cell[0] && x[1] === cell[1])) continue;
          const shape = normalizeCells([...cells, cell]);
          next.set(canonicalRotationKey(shape), shape);
        }
    shapes = [...next.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, v]) => v);
  }
  cache.set(size, shapes);
  return structuredClone(shapes);
}
