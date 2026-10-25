import { and, eq } from "drizzle-orm";
import { getDb } from "./index";
import { dailyChallenges, gameAttempts, games } from "./schema";

export async function recordAttempt(input: {
  gameSlug: string;
  challengeNumber: number;
  solved: boolean;
  durationMs: number | null;
  moves: number | null;
  anonymousId: string | null;
  result: unknown;
}) {
  const db = getDb();
  if (!db) return false;
  const [game] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.slug, input.gameSlug))
    .limit(1);
  if (!game) return false;
  const [challenge] = await db
    .select({ id: dailyChallenges.id })
    .from(dailyChallenges)
    .where(
      and(
        eq(dailyChallenges.gameId, game.id),
        eq(dailyChallenges.challengeNumber, input.challengeNumber),
      ),
    )
    .limit(1);
  await db
    .insert(gameAttempts)
    .values({
      challengeId: challenge?.id,
      gameSlug: input.gameSlug,
      challengeNumber: input.challengeNumber,
      solved: input.solved,
      moves: input.moves,
      durationMs: input.durationMs,
      anonymousId: input.anonymousId,
      result: input.result as Record<string, unknown>,
    });
  return true;
}
