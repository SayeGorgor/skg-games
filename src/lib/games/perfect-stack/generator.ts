import { createHash } from "node:crypto";
import {
  STACK_COLORS,
  STACK_DIFFICULTIES,
  canonicalRotationKey,
  cellKey,
  getDailyStackSeed,
  type GeneratedStackPuzzle,
  type PublicStackPuzzle,
  type StackDifficulty,
  type StackPiece,
} from "../perfect-stack";
import { generatePolyominoes } from "./polyominoes";
import { createSeededRandom } from "./rng";
import { countSolutions, solveStackPuzzle } from "./solver";
export const MAX_GENERATION_ATTEMPTS = 256;
export const MAX_TOTAL_SOLVER_NODES = 120000;
export function fingerprintStackPuzzle(
  puzzle: Pick<PublicStackPuzzle, "rows" | "cols" | "pieces" | "difficulty">,
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        2,
        puzzle.difficulty,
        puzzle.rows,
        puzzle.cols,
        puzzle.pieces.map((p) => canonicalRotationKey(p.cells)).sort(),
      ]),
    )
    .digest("hex");
}
export function generateStackPuzzle(
  difficulty: StackDifficulty,
  seed: string,
  options: {
    mode?: "daily" | "practice";
    challengeDate?: string;
    challengeNumber?: number;
  } = {},
): GeneratedStackPuzzle {
  const config = STACK_DIFFICULTIES[difficulty];
  let totalNodes = 0;
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const random = createSeededRandom(`${seed}:v2:attempt:${attempt}`),
      used = new Set<string>();
    const pieces: StackPiece[] = config.pieceSizes.map((size, i) => {
      const pool = generatePolyominoes(size).filter(
        (c) => !used.has(canonicalRotationKey(c)),
      );
      const cells = pool[Math.floor(random() * pool.length)],
        shapeId = canonicalRotationKey(cells);
      used.add(shapeId);
      return {
        id: `piece-${i + 1}`,
        shapeId,
        color: STACK_COLORS[i % STACK_COLORS.length],
        cells,
      };
    });
    const publicPuzzle: PublicStackPuzzle = {
      schemaVersion: 2,
      generatorVersion: 2,
      mode: options.mode ?? "practice",
      difficulty,
      seed,
      challengeDate: options.challengeDate ?? null,
      challengeNumber: options.challengeNumber ?? null,
      rows: config.rows,
      cols: config.cols,
      pieces,
      pieceCount: pieces.length,
      optimalPlacements: pieces.length,
    };
    const solution = solveStackPuzzle(publicPuzzle);
    totalNodes += solution.nodesVisited;
    if (totalNodes > MAX_TOTAL_SOLVER_NODES) break;
    if (!solution.solved) continue;
    const counted = countSolutions(publicPuzzle);
    const owners = new Map(
      solution.placements.flatMap((p) =>
        p.cells.map((c) => [cellKey(c), p.pieceId] as const),
      ),
    );
    const assigned = new Map<string, (typeof STACK_COLORS)[number]>();
    for (const placement of solution.placements) {
      const neighbors = new Set(
        placement.cells.flatMap(([r, c]) =>
          [
            [r + 1, c],
            [r - 1, c],
            [r, c + 1],
            [r, c - 1],
          ].map(([y, x]) => assigned.get(owners.get(cellKey([y, x])) ?? "")),
        ),
      );
      const palette = [
        ...STACK_COLORS.slice(assigned.size % STACK_COLORS.length),
        ...STACK_COLORS.slice(0, assigned.size % STACK_COLORS.length),
      ];
      const color = palette.find((c) => !neighbors.has(c)) ?? "blue";
      assigned.set(placement.pieceId, color);
      pieces.find((p) => p.id === placement.pieceId)!.color = color;
    }
    // Board/piece complexity dominates; search effort raises the score, abundant solutions lower it.
    const difficultyScore =
      pieces.length * 10 +
      Math.max(...config.pieceSizes) * 3 +
      Math.log2(solution.nodesVisited + 1) * 2 -
      counted.count * 2;
    return {
      publicPuzzle,
      canonicalSolution: solution.placements,
      fingerprint: fingerprintStackPuzzle(publicPuzzle),
      metrics: {
        pieceCount: pieces.length,
        nodesToFirstSolution: solution.nodesVisited,
        solutionCountCapped: counted.count,
        solutionCountComplete: !counted.exhausted && counted.count < 3,
        averagePieceSize: (config.rows * config.cols) / pieces.length,
        maxPieceSize: Math.max(...config.pieceSizes),
        difficultyScore,
      },
    };
  }
  throw new Error(`Stack generation budget exhausted (${difficulty})`);
}
export function generateDailyStackPuzzle(
  date: string,
  difficulty: StackDifficulty,
  challengeNumber: number,
  reserved = new Set<string>(),
) {
  const candidates: GeneratedStackPuzzle[] = [];
  for (let i = 0; i < 6; i++) {
    try {
      const candidate = generateStackPuzzle(
        difficulty,
        `${getDailyStackSeed(date, difficulty)}:candidate:${i}`,
        { mode: "daily", challengeDate: date, challengeNumber },
      );
      if (!reserved.has(candidate.fingerprint)) candidates.push(candidate);
    } catch {
      /* bounded candidate rejected */
    }
  }
  candidates.sort((a, b) =>
    difficulty === "hard"
      ? b.metrics.difficultyScore - a.metrics.difficultyScore
      : a.metrics.difficultyScore - b.metrics.difficultyScore,
  );
  if (!candidates.length)
    throw new Error("No unreserved Daily candidate within generation budget");
  return candidates[0];
}
