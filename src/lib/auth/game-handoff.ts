import {
  placeCells,
  shapeKey,
  validPlacement,
  isStackSolved,
  type StackPuzzle,
  type StackPlacement,
} from "../games/perfect-stack";
export type StackHandoff = {
  placements: StackPlacement[];
  rotations: Record<string, number>;
  moves: number;
  seconds: number;
  selected: string;
};
const keyFor = (p: StackPuzzle) =>
  `skg-auth-board:${p.mode}:${p.challengeDate}:${p.difficulty}:${p.seed}`;
export function saveStackHandoff(puzzle: StackPuzzle, state: StackHandoff) {
  try {
    sessionStorage.setItem(keyFor(puzzle), JSON.stringify(state));
  } catch {}
}
export function readStackHandoff(puzzle: StackPuzzle): StackHandoff | null {
  try {
    const raw = sessionStorage.getItem(keyFor(puzzle));
    if (!raw) return null;
    const saved = JSON.parse(raw) as StackHandoff;
    if (
      !Number.isSafeInteger(saved.moves) ||
      saved.moves < 0 ||
      !Number.isSafeInteger(saved.seconds) ||
      saved.seconds < 0 ||
      !Array.isArray(saved.placements) ||
      !saved.rotations ||
      typeof saved.rotations !== "object"
    )
      return null;
    const accepted: StackPlacement[] = [];
    for (const placement of saved.placements) {
      const piece = puzzle.pieces.find((p) => p.id === placement.pieceId);
      if (
        !piece ||
        accepted.some((p) => p.pieceId === piece.id) ||
        !Number.isInteger(placement.rotation) ||
        placement.rotation < 0 ||
        placement.rotation > 3 ||
        !Array.isArray(placement.anchor) ||
        placement.anchor.length !== 2 ||
        !placement.anchor.every(Number.isInteger) ||
        !Array.isArray(placement.cells)
      )
        return null;
      const cells = placeCells(piece, placement.anchor, placement.rotation);
      if (
        shapeKey(cells) !== shapeKey(placement.cells) ||
        !validPlacement(puzzle, cells, accepted, piece.id)
      )
        return null;
      accepted.push({ ...placement, cells });
    }
    if (isStackSolved(puzzle, accepted)) return null;
    const rotations: Record<string, number> = {};
    for (const piece of puzzle.pieces) {
      const value = saved.rotations[piece.id];
      if (Number.isInteger(value) && value >= 0 && value <= 3)
        rotations[piece.id] = value;
    }
    return {
      ...saved,
      placements: accepted,
      rotations,
      selected: puzzle.pieces.some((p) => p.id === saved.selected)
        ? saved.selected
        : puzzle.pieces[0].id,
    };
  } catch {
    return null;
  }
}
export function clearStackHandoff(puzzle: StackPuzzle) {
  try {
    sessionStorage.removeItem(keyFor(puzzle));
  } catch {}
}
