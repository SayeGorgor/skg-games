import { getGameDate } from "./game-date";
import { fingerprintAlibiCase, type DailyAlibiCase } from "./games/alibi";
import {
  isStackSolved,
  oriented,
  shapeKey,
  type Cell,
  type PublicStackPuzzle,
  type StackDifficulty,
  type StackPlacement,
} from "./games/perfect-stack";

export type LocalProgress = { alibiSolved: boolean; stackSolved: boolean };
const KEY = "skg-progress-v1";
function readLocalProgressStorage(): Record<string, unknown> {
  if (typeof window !== "undefined")
    try {
      const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      if (isRecord(value)) return value;
    } catch {
      /* A blocked or malformed store must not prevent playing. */
    }
  return {};
}

export function getLocalProgress(): LocalProgress {
  if (typeof window === "undefined")
    return { alibiSolved: false, stackSolved: false };
  const saved = readLocalProgressStorage();
  return {
    // Keep undated legacy indicators compatible; new results expire by date.
    alibiSolved:
      saved.alibiSolved === true &&
      (saved.alibiSolvedDate === undefined ||
        saved.alibiSolvedDate === getGameDate()),
    stackSolved: isStackDailyComplete(),
  };
}

export function markLocalSolved(game: "alibi" | "stack") {
  const current = getLocalProgress();
  const next = {
    ...current,
    [game === "alibi" ? "alibiSolved" : "stackSolved"]: true,
  };
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ...readLocalProgressStorage(),
        ...next,
        ...(game === "alibi" ? { alibiSolvedDate: getGameDate() } : {}),
      }),
    );
  } catch {}
  return next;
}

export type DailyAlibiSavedResult = {
  schemaVersion: 1;
  challengeDate: string;
  challengeNumber: number;
  puzzleFingerprint: string;
  accusedSuspectId: string;
  completed: true;
  completedAt: string;
};
export function getDailyAlibiResult(
  date = getGameDate(),
): DailyAlibiSavedResult | null {
  const results = readLocalProgressStorage().dailyAlibiResults;
  if (!isRecord(results)) return null;
  const result = results[date];
  if (
    !isRecord(result) ||
    result.schemaVersion !== 1 ||
    result.completed !== true ||
    result.challengeDate !== date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    typeof result.challengeNumber !== "number" ||
    !Number.isSafeInteger(result.challengeNumber) ||
    result.challengeNumber < 0 ||
    typeof result.puzzleFingerprint !== "string" ||
    !/^alibi-v1-[0-9a-f]{16}$/.test(result.puzzleFingerprint) ||
    typeof result.accusedSuspectId !== "string" ||
    !result.accusedSuspectId ||
    result.accusedSuspectId.length > 128 ||
    typeof result.completedAt !== "string" ||
    !Number.isFinite(Date.parse(result.completedAt))
  )
    return null;
  return {
    schemaVersion: 1,
    completed: true,
    challengeDate: date,
    challengeNumber: result.challengeNumber,
    puzzleFingerprint: result.puzzleFingerprint,
    accusedSuspectId: result.accusedSuspectId,
    completedAt: result.completedAt,
  };
}
export function getRestoredDailyAlibiState(caseData: DailyAlibiCase) {
  const saved = getDailyAlibiResult(caseData.challengeDate);
  if (
    !saved ||
    saved.challengeNumber !== caseData.challengeNumber ||
    saved.puzzleFingerprint !== fingerprintAlibiCase(caseData)
  )
    return null;
  const accused = caseData.suspects.find(
    (suspect) => suspect.key === saved.accusedSuspectId,
  );
  return accused ? { saved, accused } : null;
}
export function saveDailyAlibiResult(
  caseData: DailyAlibiCase,
  accusedSuspectId: string,
): DailyAlibiSavedResult | null {
  const existing = getRestoredDailyAlibiState(caseData);
  if (existing) return existing.saved;
  const accused = caseData.suspects.find(
    (suspect) => suspect.key === accusedSuspectId,
  );
  if (!accused || !/^\d{4}-\d{2}-\d{2}$/.test(caseData.challengeDate))
    return null;
  const result: DailyAlibiSavedResult = {
    schemaVersion: 1,
    completed: true,
    challengeDate: caseData.challengeDate,
    challengeNumber: caseData.challengeNumber,
    puzzleFingerprint: fingerprintAlibiCase(caseData),
    accusedSuspectId: accused.key,
    completedAt: new Date().toISOString(),
  };
  try {
    const progress = readLocalProgressStorage();
    const results = isRecord(progress.dailyAlibiResults)
      ? progress.dailyAlibiResults
      : {};
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ...progress,
        // Preserve the existing correct-only homepage solved indicator. Incorrect
        // accusations are still completed and cannot be replayed.
        alibiSolved: accused.correct,
        alibiSolvedDate: caseData.challengeDate,
        dailyAlibiResults: { ...results, [caseData.challengeDate]: result },
      }),
    );
  } catch {}
  return result;
}
export function isDailyAlibiComplete(date = getGameDate()) {
  return getDailyAlibiResult(date)?.completed === true;
}

export function getAnonymousId() {
  const key = "skg-anonymous-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
export type StackDifficultyResult = {
  solved: true;
  stars: 1 | 2 | 3;
  moves: number;
  durationMs: number;
  // Optional only so completion metadata written before board persistence survives.
  puzzleSeed?: string;
  placements?: StackPlacement[];
};
export type RestoredDailyStackState = StackDifficultyResult & {
  puzzleSeed: string;
  placements: StackPlacement[];
};
export type DailyStackProgress = {
  date: string;
  difficulties: Partial<Record<StackDifficulty, StackDifficultyResult>>;
};
const STACK_KEY = "skg-stack-progress-v2";
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isCell(value: unknown): value is Cell {
  return (
    Array.isArray(value) && value.length === 2 && value.every(Number.isInteger)
  );
}
function readPlacements(value: unknown): StackPlacement[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64)
    return null;
  if (
    !value.every(
      (placement: unknown) =>
        isRecord(placement) &&
        typeof placement.pieceId === "string" &&
        isCell(placement.anchor) &&
        typeof placement.rotation === "number" &&
        Number.isInteger(placement.rotation) &&
        placement.rotation >= 0 &&
        placement.rotation < 4 &&
        Array.isArray(placement.cells) &&
        placement.cells.length > 0 &&
        placement.cells.length <= 64 &&
        placement.cells.every(isCell),
    )
  )
    return null;
  return value as StackPlacement[];
}
function readStackStorage(): Record<string, unknown> {
  if (typeof window !== "undefined")
    try {
      const all: unknown = JSON.parse(localStorage.getItem(STACK_KEY) ?? "{}");
      if (isRecord(all)) return all;
    } catch {
      /* A blocked or malformed store must not prevent playing. */
    }
  return {};
}
export function isValidPersistedStackSolution(
  puzzle: PublicStackPuzzle,
  value: unknown,
): value is StackPlacement[] {
  const placements = readPlacements(value);
  if (!placements || placements.length !== puzzle.pieces.length) return false;
  for (const placement of placements) {
    const piece = puzzle.pieces.find((piece) => piece.id === placement.pieceId);
    if (
      !piece ||
      placement.anchor[0] < 0 ||
      placement.anchor[1] < 0 ||
      placement.anchor[0] >= puzzle.rows ||
      placement.anchor[1] >= puzzle.cols ||
      placement.cells.length !== piece.cells.length ||
      shapeKey(placement.cells) !==
        shapeKey(oriented(piece, placement.rotation))
    )
      return false;
  }
  return isStackSolved(puzzle, placements);
}
export function getStackDailyProgress(
  date = getGameDate(),
): DailyStackProgress {
  const progress: DailyStackProgress = { date, difficulties: {} };
  const saved = readStackStorage()[date];
  if (!isRecord(saved) || saved.date !== date || !isRecord(saved.difficulties))
    return progress;
  for (const difficulty of ["small", "medium", "hard"] as const) {
    const result = saved.difficulties[difficulty];
    if (
      !isRecord(result) ||
      result.solved !== true ||
      typeof result.stars !== "number" ||
      ![1, 2, 3].includes(result.stars) ||
      typeof result.moves !== "number" ||
      !Number.isSafeInteger(result.moves) ||
      result.moves < 0 ||
      typeof result.durationMs !== "number" ||
      !Number.isSafeInteger(result.durationMs) ||
      result.durationMs < 0
    )
      continue;
    const placements = readPlacements(result.placements);
    progress.difficulties[difficulty] = {
      solved: true,
      moves: result.moves,
      durationMs: result.durationMs,
      stars: result.stars as 1 | 2 | 3,
      ...(typeof result.puzzleSeed === "string"
        ? { puzzleSeed: result.puzzleSeed }
        : {}),
      ...(placements ? { placements } : {}),
    };
  }
  return progress;
}
export function getRestoredDailyStackState(
  puzzle: PublicStackPuzzle,
  progress = getStackDailyProgress(puzzle.challengeDate ?? undefined),
): RestoredDailyStackState | null {
  if (
    puzzle.mode !== "daily" ||
    !puzzle.challengeDate ||
    progress.date !== puzzle.challengeDate
  )
    return null;
  const saved = progress.difficulties[puzzle.difficulty];
  if (
    !saved?.solved ||
    saved.puzzleSeed !== puzzle.seed ||
    saved.moves < puzzle.pieceCount ||
    !isValidPersistedStackSolution(puzzle, saved.placements)
  )
    return null;
  return structuredClone({
    ...saved,
    puzzleSeed: saved.puzzleSeed,
    placements: saved.placements,
  });
}
export function markStackDailySolved(
  date: string,
  difficulty: StackDifficulty,
  result: RestoredDailyStackState,
  puzzle?: PublicStackPuzzle,
) {
  const current = getStackDailyProgress(date),
    old = current.difficulties[difficulty];
  // A legacy, stale or corrupt result must never prevent a replay saving a real board.
  const oldRestorable =
    old?.puzzleSeed === result.puzzleSeed &&
    readPlacements(old?.placements) !== null &&
    (!puzzle || isValidPersistedStackSolution(puzzle, old?.placements));
  if (
    old &&
    oldRestorable &&
    (old.stars > result.stars ||
      (old.stars === result.stars && old.moves <= result.moves))
  )
    return current;
  const progress: DailyStackProgress = {
    ...current,
    difficulties: {
      ...current.difficulties,
      [difficulty]: structuredClone(result),
    },
  };
  try {
    localStorage.setItem(
      STACK_KEY,
      JSON.stringify({ ...readStackStorage(), [date]: progress }),
    );
  } catch {}
  return progress;
}
export function isStackDailyComplete(date = getGameDate()) {
  return Object.values(getStackDailyProgress(date).difficulties).some(
    (r) => r?.solved,
  );
}
