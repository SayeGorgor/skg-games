import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { dailyChallenges, games, stackPuzzles } from "../../db/schema";
import { getGameDate } from "../../game-date";
import {
  type PublicStackPuzzle,
  type StackDifficulty,
  type StackPiece,
} from "../perfect-stack";
import { generateDailyStackPuzzle } from "./generator";
export function getStackChallengeNumber(date: string) {
  const epoch = process.env.PERFECT_STACK_EPOCH_DATE ?? "2026-10-25";
  return (
    Number(process.env.PERFECT_STACK_EPOCH_NUMBER ?? 127) +
    Math.round((Date.parse(date) - Date.parse(epoch)) / 86400000)
  );
}
const fallback = new Map<string, PublicStackPuzzle>();
export async function getDailyStackPuzzle(
  difficulty: StackDifficulty,
  date = getGameDate(),
): Promise<PublicStackPuzzle> {
  const db = getDb();
  if (db) {
    const [row] = await db
      .select({ puzzle: stackPuzzles, challenge: dailyChallenges })
      .from(stackPuzzles)
      .innerJoin(
        dailyChallenges,
        eq(stackPuzzles.challengeId, dailyChallenges.id),
      )
      .innerJoin(games, eq(dailyChallenges.gameId, games.id))
      .where(
        and(
          eq(games.slug, "perfect-stack"),
          eq(dailyChallenges.challengeDate, date),
          eq(stackPuzzles.difficulty, difficulty),
        ),
      )
      .limit(1);
    if (!row)
      throw new Error(
        "Daily Stack has not been prepared. Run generate:stack-dailies.",
      );
    const p = row.puzzle;
    return {
      schemaVersion: 2,
      generatorVersion: 2,
      mode: "daily",
      difficulty,
      seed: p.seed,
      challengeNumber: row.challenge.challengeNumber,
      challengeDate: date,
      rows: p.rows,
      cols: p.cols,
      pieces: p.pieces as StackPiece[],
      pieceCount: (p.pieces as StackPiece[]).length,
      optimalPlacements: p.optimalPlacements,
    };
  }
  const key = `${date}:${difficulty}`;
  if (!fallback.has(key)) {
    const puzzle = generateDailyStackPuzzle(
      date,
      difficulty,
      getStackChallengeNumber(date),
    ).publicPuzzle;
    if (fallback.size >= 9) fallback.delete(fallback.keys().next().value!);
    fallback.set(key, puzzle);
  }
  return fallback.get(key)!;
}
