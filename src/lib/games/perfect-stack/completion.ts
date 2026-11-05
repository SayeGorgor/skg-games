import {
  isStackSolved,
  oriented,
  placeCells,
  type PublicStackPuzzle,
  type StackPlacement,
  type StackDifficulty,
} from "../perfect-stack";

export type AccountStackCompletion = {
  completed: true;
  eventId: string;
  challengeNumber: number;
  puzzleSeed: string;
  generatorVersion: number;
  moves: number | null;
  durationMs: number | null;
  stars: 1 | 2 | 3 | null;
  completedAt: string | null;
  placements: StackPlacement[] | null;
};
export type AccountStackProgress = {
  accountKey: string;
  challengeDate: string;
  difficulties: Record<StackDifficulty, AccountStackCompletion | null>;
};
export const stackAccountCacheKey = (scope: string, date: string) =>
  `skg-stack-account-results-v1:${scope}:${date}`;
export function stackCompletionIdentity(
  value: Pick<
    AccountStackCompletion,
    "moves" | "durationMs" | "stars" | "placements"
  >,
) {
  if (
    value.placements &&
    (!Array.isArray(value.placements) ||
      value.placements.some(
        (p) =>
          !p ||
          !Array.isArray(p.anchor) ||
          !Array.isArray(p.cells) ||
          p.cells.some((c) => !Array.isArray(c)),
      ))
  )
    return "invalid-snapshot";
  return JSON.stringify([
    value.moves,
    value.durationMs,
    value.stars,
    value.placements
      ?.map((p) => [
        p.pieceId,
        p.rotation,
        p.anchor,
        [...p.cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))) ?? null,
  ]);
}

// Validate the exact rotation AND anchor, not merely congruence under some
// rotation. This shared pure validator is also safe for browser cache reads.
export function validCompletedStackPlacements(
  puzzle: PublicStackPuzzle,
  input: unknown,
): input is StackPlacement[] {
  if (!Array.isArray(input) || input.length !== puzzle.pieceCount) return false;
  for (const p of input) {
    if (
      !p ||
      typeof p !== "object" ||
      typeof p.pieceId !== "string" ||
      !Number.isInteger(p.rotation) ||
      p.rotation < 0 ||
      p.rotation > 3 ||
      !Array.isArray(p.anchor) ||
      p.anchor.length !== 2 ||
      !p.anchor.every(Number.isInteger) ||
      !Array.isArray(p.cells) ||
      !p.cells.every(
        (c: unknown) =>
          Array.isArray(c) && c.length === 2 && c.every(Number.isInteger),
      )
    )
      return false;
    const piece = puzzle.pieces.find((x) => x.id === p.pieceId);
    if (!piece) return false;
    const expected = placeCells(piece, p.anchor, p.rotation)
      .map((c) => c.join(":"))
      .sort();
    const actual = p.cells.map((c: number[]) => c.join(":")).sort();
    // Solver snapshots historically use the bounding-box origin; pointer
    // placements use the first occupied cell. Both retain exact orientation.
    const legacy = oriented(piece, p.rotation)
      .map(([r, c]) => `${r + p.anchor[0]}:${c + p.anchor[1]}`)
      .sort();
    if (
      JSON.stringify(expected) !== JSON.stringify(actual) &&
      JSON.stringify(legacy) !== JSON.stringify(actual)
    )
      return false;
  }
  return isStackSolved(puzzle, input);
}

export function matchesAccountCompletion(
  puzzle: PublicStackPuzzle,
  value: AccountStackCompletion | null | undefined,
) {
  return Boolean(
    value &&
    value.completed === true &&
    value.puzzleSeed === puzzle.seed &&
    value.generatorVersion === puzzle.generatorVersion &&
    value.challengeNumber === puzzle.challengeNumber &&
    Number.isSafeInteger(value.moves) &&
    value.moves! >= puzzle.pieceCount &&
    Number.isSafeInteger(value.durationMs) &&
    value.durationMs! >= 0 &&
    [1, 2, 3].includes(value.stars!) &&
    validCompletedStackPlacements(puzzle, value.placements),
  );
}
