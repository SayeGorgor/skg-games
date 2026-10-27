export type Cell = [number, number];
export type StackDifficulty = "small" | "medium" | "hard";
export const STACK_GENERATOR_VERSION = 2;
export const STACK_DIFFICULTIES = {
  small: {
    rows: 5,
    cols: 5,
    pieceSizes: [5, 5, 5, 5, 5],
    description: "A quick warm-up.",
    time: "1–3 min",
  },
  medium: {
    rows: 6,
    cols: 6,
    pieceSizes: [5, 5, 5, 5, 4, 4, 4, 4],
    description: "The standard Daily challenge.",
    time: "3–6 min",
  },
  hard: {
    rows: 8,
    cols: 8,
    pieceSizes: [6, 6, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 4],
    description: "More pieces. Fewer obvious placements.",
    time: "5–10+ min",
  },
};
for (const config of Object.values(STACK_DIFFICULTIES)) {
  if (
    config.pieceSizes.reduce((a, b) => a + b, 0) !==
    config.rows * config.cols
  )
    throw new Error("Invalid Stack configuration");
}
export const STACK_COLORS = [
  "blue",
  "gold",
  "green",
  "coral",
  "violet",
  "cyan",
  "rose",
  "lime",
] as const;
export type StackColor = (typeof STACK_COLORS)[number];
export type StackPiece = {
  id: string;
  shapeId: string;
  color: StackColor;
  cells: Cell[];
};
export type StackPlacement = {
  pieceId: string;
  anchor: Cell;
  rotation: number;
  cells: Cell[];
};
export type PublicStackPuzzle = {
  schemaVersion: 2;
  generatorVersion: 2;
  mode: "daily" | "practice";
  difficulty: StackDifficulty;
  seed: string;
  challengeNumber: number | null;
  challengeDate: string | null;
  rows: number;
  cols: number;
  pieces: StackPiece[];
  pieceCount: number;
  optimalPlacements: number;
};
export type StackPuzzle = PublicStackPuzzle;
export type StackGenerationMetrics = {
  pieceCount: number;
  nodesToFirstSolution: number;
  solutionCountCapped: number;
  solutionCountComplete: boolean;
  averagePieceSize: number;
  maxPieceSize: number;
  difficultyScore: number;
};
export type GeneratedStackPuzzle = {
  publicPuzzle: PublicStackPuzzle;
  canonicalSolution: StackPlacement[];
  metrics: StackGenerationMetrics;
  fingerprint: string;
};
export const cellKey = ([r, c]: Cell) => `${r}:${c}`;
export function normalizeCells(cells: Cell[]): Cell[] {
  const r = Math.min(...cells.map((c) => c[0])),
    c = Math.min(...cells.map((c) => c[1]));
  return cells
    .map(([y, x]) => [y - r, x - c] as Cell)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
export const rotateCells = (cells: Cell[]) =>
  normalizeCells(cells.map(([r, c]) => [c, -r]));
export const shapeKey = (cells: Cell[]) =>
  normalizeCells(cells).map(cellKey).join(";");
export function orientations(cells: Cell[]) {
  const result: { cells: Cell[]; rotation: number }[] = [];
  const seen = new Set<string>();
  for (let rotation = 0; rotation < 4; rotation++, cells = rotateCells(cells)) {
    const k = shapeKey(cells);
    if (!seen.has(k)) {
      seen.add(k);
      result.push({ cells: normalizeCells(cells), rotation });
    }
  }
  return result;
}
export const canonicalRotationKey = (cells: Cell[]) =>
  orientations(cells)
    .map((o) => shapeKey(o.cells))
    .sort()[0];
export function oriented(piece: StackPiece, rotation: number) {
  let cells = piece.cells;
  for (let i = 0; i < rotation % 4; i++) cells = rotateCells(cells);
  return cells;
}
export const getDragAnchor = (cells: Cell[]): Cell => normalizeCells(cells)[0];
export function placeCells(
  piece: StackPiece,
  anchor: Cell,
  rotation: number,
  pieceAnchor = getDragAnchor(oriented(piece, rotation)),
) {
  return oriented(piece, rotation).map(
    ([r, c]) =>
      [anchor[0] + r - pieceAnchor[0], anchor[1] + c - pieceAnchor[1]] as Cell,
  );
}
export function validPlacement(
  puzzle: Pick<PublicStackPuzzle, "rows" | "cols">,
  cells: Cell[],
  placements: StackPlacement[],
  pieceId: string,
) {
  const occupied = new Set(
    placements
      .filter((p) => p.pieceId !== pieceId)
      .flatMap((p) => p.cells.map(cellKey)),
  );
  return (
    new Set(cells.map(cellKey)).size === cells.length &&
    cells.every(
      ([r, c]) =>
        Number.isInteger(r) &&
        Number.isInteger(c) &&
        r >= 0 &&
        c >= 0 &&
        r < puzzle.rows &&
        c < puzzle.cols &&
        !occupied.has(cellKey([r, c])),
    )
  );
}
export function isStackSolved(
  puzzle: PublicStackPuzzle,
  placements: StackPlacement[],
) {
  if (
    placements.length !== puzzle.pieces.length ||
    new Set(placements.map((p) => p.pieceId)).size !== puzzle.pieces.length
  )
    return false;
  for (const p of placements) {
    const piece = puzzle.pieces.find((x) => x.id === p.pieceId);
    if (
      !piece ||
      !Number.isInteger(p.rotation) ||
      p.rotation < 0 ||
      p.rotation > 3 ||
      canonicalRotationKey(p.cells) !== piece.shapeId ||
      !validPlacement(puzzle, p.cells, placements, p.pieceId)
    )
      return false;
  }
  return (
    new Set(placements.flatMap((p) => p.cells.map(cellKey))).size ===
    puzzle.rows * puzzle.cols
  );
}
export function getStackStars(moves: number, pieceCount: number): 1 | 2 | 3 {
  const extra = Math.max(0, moves - pieceCount);
  return extra === 0
    ? 3
    : extra <= Math.max(2, Math.ceil(pieceCount * 0.25))
      ? 2
      : 1;
}
export const getDailyStackSeed = (date: string, difficulty: StackDifficulty) =>
  `ps:daily:v2:${date}:${difficulty}`;
export const getPracticeStackSeed = (
  seed: string,
  difficulty: StackDifficulty,
) => `ps:practice:v2:${seed}:${difficulty}`;
export const isStackDifficulty = (s: unknown): s is StackDifficulty =>
  s === "small" || s === "medium" || s === "hard";
export const validPublicSeed = (s: string) => /^[A-Za-z0-9_-]{1,64}$/.test(s);
