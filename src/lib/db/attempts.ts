import { and, eq, or } from "drizzle-orm";
import { getDb } from "./index";
import { dailyChallenges, gameAttempts, games } from "./schema";

export async function recordAttempt(input: {
  gameSlug: string;
  challengeNumber: number | null;
  mode?: "daily" | "practice";
  variant?: string;
  puzzleSeed?: string;
  solved: boolean;
  durationMs: number | null;
  moves: number | null;
  anonymousId: string | null;
  userId?: string | null;
  result: unknown;
  clientEventId?: string;
  resultKey?: string;
  challengeDate?: string | null;
  completedAt?: string | null;
  verified?: boolean;
}) {
  const db = getDb();
  if (!db) return false;
  const [game] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.slug, input.gameSlug))
    .limit(1);
  if (!game) return false;
  const [challenge] =
    input.mode === "practice" || input.challengeNumber === null
      ? []
      : await db
          .select({ id: dailyChallenges.id })
          .from(dailyChallenges)
          .where(
            and(
              eq(dailyChallenges.gameId, game.id),
              input.challengeDate
                ? eq(dailyChallenges.challengeDate, input.challengeDate)
                : eq(dailyChallenges.challengeNumber, input.challengeNumber),
            ),
          )
          .limit(1);
  await db
    .insert(gameAttempts)
    .values({
      challengeId: challenge?.id,
      gameSlug: input.gameSlug,
      challengeNumber: input.challengeNumber,
      mode: input.mode ?? "daily",
      variant: input.variant,
      puzzleSeed: input.puzzleSeed,
      solved: input.solved,
      moves: input.moves,
      durationMs: input.durationMs,
      anonymousId: input.anonymousId,
      userId: input.userId ?? null,
      result: input.result as Record<string, unknown>,
      clientEventId: input.clientEventId,
      resultKey: input.resultKey,
      challengeDate: input.challengeDate,
      completedAt:
        input.completedAt === undefined
          ? new Date()
          : input.completedAt === null
            ? null
            : new Date(input.completedAt),
      verified: input.verified ?? false,
    })
    .onConflictDoNothing();
  if (!input.clientEventId || !input.userId || !input.resultKey) return true;
  // A duplicate is acknowledged only when this account owns the stored result.
  const [owned] = await db
    .select({ id: gameAttempts.id })
    .from(gameAttempts)
    .where(
      and(
        eq(gameAttempts.userId, input.userId),
        or(
          eq(gameAttempts.clientEventId, input.clientEventId),
          eq(gameAttempts.resultKey, input.resultKey),
        ),
      ),
    )
    .limit(1);
  return Boolean(owned);
}
