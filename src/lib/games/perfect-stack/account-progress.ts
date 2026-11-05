import { and, eq, or } from "drizzle-orm";
import { getDb } from "../../db";
import { dailyChallenges, gameAttempts } from "../../db/schema";
import { accountKey } from "../../auth/account-key";
import { compareStackResults } from "../../results/shared";
import { getDailyStackPuzzle } from "./daily";
import { getStackStars, isStackDifficulty } from "../perfect-stack";
import {
  validCompletedStackPlacements,
  type AccountStackProgress,
} from "./completion";

export async function readAccountStackProgress(
  userId: string,
  date: string,
): Promise<AccountStackProgress> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db
    .select({ attempt: gameAttempts })
    .from(gameAttempts)
    .leftJoin(dailyChallenges, eq(gameAttempts.challengeId, dailyChallenges.id))
    .where(
      and(
        eq(gameAttempts.userId, userId),
        eq(gameAttempts.gameSlug, "perfect-stack"),
        eq(gameAttempts.mode, "daily"),
        eq(gameAttempts.status, "completed"),
        eq(gameAttempts.solved, true),
        or(
          eq(gameAttempts.challengeDate, date),
          eq(dailyChallenges.challengeDate, date),
        ),
      ),
    );
  const response: AccountStackProgress = {
    accountKey: accountKey(userId),
    challengeDate: date,
    difficulties: { small: null, medium: null, hard: null },
  };
  for (const difficulty of ["small", "medium", "hard"] as const) {
    const candidates = rows
      .map((r) => r.attempt)
      .filter((r) => isStackDifficulty(r.variant) && r.variant === difficulty)
      .sort((a, b) =>
        compareStackResults(
          {
            moves: a.moves,
            completedAt: a.completedAt?.toISOString() ?? null,
            eventId: a.clientEventId ?? a.id,
          },
          {
            moves: b.moves,
            completedAt: b.completedAt?.toISOString() ?? null,
            eventId: b.clientEventId ?? b.id,
          },
        ),
      );
    const row = candidates[0];
    if (!row) continue;
    const puzzle = await getDailyStackPuzzle(difficulty, date);
    const result = row.result as {
      placements?: unknown;
      stars?: unknown;
    } | null;
    const identityMatches =
      (row.puzzleSeed === null || row.puzzleSeed === puzzle.seed) &&
      (row.challengeNumber === null ||
        row.challengeNumber === puzzle.challengeNumber);
    const placements =
      identityMatches &&
      validCompletedStackPlacements(puzzle, result?.placements)
        ? result!.placements
        : null;
    response.difficulties[difficulty] = {
      completed: true,
      eventId: row.clientEventId ?? row.id,
      challengeNumber: puzzle.challengeNumber!,
      puzzleSeed: row.puzzleSeed ?? puzzle.seed,
      generatorVersion: puzzle.generatorVersion,
      moves: row.moves,
      durationMs: row.durationMs,
      stars: [1, 2, 3].includes(result?.stars as number)
        ? (result!.stars as 1 | 2 | 3)
        : row.moves === null
          ? null
          : getStackStars(row.moves, puzzle.pieceCount),
      completedAt: row.completedAt?.toISOString() ?? null,
      placements,
    };
  }
  return response;
}
