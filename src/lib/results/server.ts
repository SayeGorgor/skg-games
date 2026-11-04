import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { dailyChallenges, gameAttempts } from "../db/schema";
import { isStackDifficulty } from "../games/perfect-stack";
import { uniqueHistory, type HistoryResult } from "./shared";

export async function readAccountHistory(userId: string) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  // Select summary fields only. Puzzle solutions and account identifiers never leave the server.
  const rows = await db
    .select({
      id: gameAttempts.id,
      eventId: gameAttempts.clientEventId,
      gameSlug: gameAttempts.gameSlug,
      mode: gameAttempts.mode,
      variant: gameAttempts.variant,
      challengeDate: sql<
        string | null
      >`coalesce(${gameAttempts.challengeDate}, ${dailyChallenges.challengeDate})`,
      challengeNumber: gameAttempts.challengeNumber,
      completedAt: gameAttempts.completedAt,
      solved: gameAttempts.solved,
      moves: gameAttempts.moves,
      durationMs: gameAttempts.durationMs,
      verified: gameAttempts.verified,
    })
    .from(gameAttempts)
    .leftJoin(dailyChallenges, eq(gameAttempts.challengeId, dailyChallenges.id))
    .where(
      and(
        eq(gameAttempts.userId, userId),
        eq(gameAttempts.status, "completed"),
      ),
    );
  const results: HistoryResult[] = rows.flatMap((row) =>
    row.gameSlug !== "daily-alibi" && row.gameSlug !== "perfect-stack"
      ? []
      : [
          {
            eventId: row.eventId ?? row.id,
            gameSlug: row.gameSlug,
            mode: row.mode,
            difficulty: isStackDifficulty(row.variant)
              ? row.variant
              : undefined,
            challengeDate: row.challengeDate,
            challengeNumber: row.challengeNumber,
            completedAt: row.completedAt?.toISOString() ?? null,
            solved: row.solved,
            moves: row.moves,
            durationMs: row.durationMs,
            verified: row.verified,
            result: {},
          },
        ],
  );
  return uniqueHistory(results);
}
