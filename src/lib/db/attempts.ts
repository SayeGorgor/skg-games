import { and, eq, or, isNull, sql } from "drizzle-orm";
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
  // A validated retry may fill an owned legacy snapshot, never its score or
  // timestamp. The conditional UPDATE makes concurrent backfills idempotent.
  const snapshot = input.result as { placements?: unknown } | null;
  if (
    input.gameSlug === "perfect-stack" &&
    input.mode === "daily" &&
    input.verified &&
    input.userId &&
    input.variant &&
    input.challengeDate &&
    snapshot?.placements &&
    input.moves !== null &&
    input.durationMs !== null
  ) {
    const [existing] = await db
      .select({ id: gameAttempts.id })
      .from(gameAttempts)
      .where(
        and(
          eq(gameAttempts.userId, input.userId),
          eq(gameAttempts.gameSlug, "perfect-stack"),
          eq(gameAttempts.mode, "daily"),
          eq(gameAttempts.status, "completed"),
          eq(gameAttempts.solved, true),
          eq(gameAttempts.variant, input.variant),
          or(
            eq(gameAttempts.challengeDate, input.challengeDate),
            challenge ? eq(gameAttempts.challengeId, challenge.id) : undefined,
          ),
        ),
      )
      .orderBy(
        sql`${gameAttempts.moves} ASC NULLS LAST`,
        sql`${gameAttempts.completedAt} ASC NULLS LAST`,
        sql`coalesce(${gameAttempts.clientEventId}, ${gameAttempts.id}) ASC`,
      )
      .limit(1);
    if (existing) {
      await db
        .update(gameAttempts)
        .set({
          result: sql`coalesce(${gameAttempts.result}, '{}'::jsonb) || jsonb_build_object('placements', ${JSON.stringify(snapshot.placements)}::jsonb)`,
          puzzleSeed: sql`coalesce(${gameAttempts.puzzleSeed}, ${input.puzzleSeed ?? null})`,
        })
        .where(
          and(
            eq(gameAttempts.id, existing.id),
            eq(gameAttempts.userId, input.userId),
            eq(gameAttempts.gameSlug, "perfect-stack"),
            eq(gameAttempts.mode, "daily"),
            eq(gameAttempts.status, "completed"),
            eq(gameAttempts.solved, true),
            eq(gameAttempts.variant, input.variant),
            eq(gameAttempts.moves, input.moves),
            eq(gameAttempts.durationMs, input.durationMs),
            or(
              eq(gameAttempts.challengeDate, input.challengeDate),
              challenge
                ? eq(gameAttempts.challengeId, challenge.id)
                : undefined,
            ),
            or(
              isNull(gameAttempts.puzzleSeed),
              eq(gameAttempts.puzzleSeed, input.puzzleSeed!),
            ),
            sql`(${gameAttempts.result}->'placements' IS NULL OR ${gameAttempts.result}->'placements' = 'null'::jsonb OR ${gameAttempts.result}->'placements' = '[]'::jsonb)`,
          ),
        );
      return true;
    }
  }
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
