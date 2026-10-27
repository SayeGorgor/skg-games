import {
  orientations,
  type PublicStackPuzzle,
  type StackPlacement,
} from "../perfect-stack";
export const MAX_SOLVER_NODES = 12000;
export const MAX_SOLUTION_COUNT_NODES = 16000;
export function countSolutions(
  puzzle: Pick<PublicStackPuzzle, "rows" | "cols" | "pieces">,
  limit = 3,
  nodeBudget = MAX_SOLUTION_COUNT_NODES,
) {
  type Option = { mask: bigint; piece: number; placement: StackPlacement };
  const area = puzzle.rows * puzzle.cols,
    full = (1n << BigInt(area)) - 1n;
  const byCell: Option[][] = Array.from({ length: area }, () => []);
  puzzle.pieces.forEach((piece, index) => {
    for (const o of orientations(piece.cells)) {
      const height = Math.max(...o.cells.map((c) => c[0])) + 1,
        width = Math.max(...o.cells.map((c) => c[1])) + 1;
      for (let r = 0; r <= puzzle.rows - height; r++)
        for (let c = 0; c <= puzzle.cols - width; c++) {
          const cells = o.cells.map(
            ([y, x]) => [r + y, c + x] as [number, number],
          );
          const mask = cells.reduce(
            (m, [y, x]) => m | (1n << BigInt(y * puzzle.cols + x)),
            0n,
          );
          const option = {
            mask,
            piece: index,
            placement: {
              pieceId: piece.id,
              anchor: [r, c] as [number, number],
              rotation: o.rotation,
              cells,
            },
          };
          for (const [y, x] of cells) byCell[y * puzzle.cols + x].push(option);
        }
    }
  });
  let nodesVisited = 0,
    count = 0,
    placements: StackPlacement[] = [],
    exhausted = false;
  function search(occupied: bigint, used: number, path: StackPlacement[]) {
    if (count >= limit || exhausted) return;
    if (++nodesVisited > nodeBudget) {
      exhausted = true;
      return;
    }
    if (occupied === full) {
      count++;
      if (count === 1) placements = [...path];
      return;
    }
    let best: Option[] | undefined;
    for (let cell = 0; cell < area; cell++) {
      if (occupied & (1n << BigInt(cell))) continue;
      const legal = byCell[cell].filter(
        (o) => !(used & (1 << o.piece)) && !(occupied & o.mask),
      );
      if (!legal.length) return;
      if (!best || legal.length < best.length) best = legal;
      if (best.length === 1) break;
    }
    for (const o of best ?? []) {
      search(occupied | o.mask, used | (1 << o.piece), [...path, o.placement]);
      if (count >= limit || exhausted) break;
    }
  }
  search(0n, 0, []);
  return { solved: count > 0, placements, nodesVisited, count, exhausted };
}
export const solveStackPuzzle = (
  puzzle: Pick<PublicStackPuzzle, "rows" | "cols" | "pieces">,
  nodeBudget = MAX_SOLVER_NODES,
) => countSolutions(puzzle, 1, nodeBudget);
