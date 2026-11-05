import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import {
  alibiCases,
  alibiClues,
  alibiSuspects,
  dailyChallenges,
  games,
} from "../../db/schema";
import { getGameDate } from "../../game-date";
import { dailyAlibi, type DailyAlibiCase } from "../alibi";
import { calendarDate } from "./scheduling";

export class AlibiUnavailableError extends Error {}

// Server-only entry point. Past dates support result syncing; future dates are
// denied even when prepared or accidentally marked published early.
export async function getDailyAlibiChallenge(
  date = getGameDate(),
): Promise<DailyAlibiCase> {
  calendarDate(date);
  if (date > getGameDate())
    throw new AlibiUnavailableError("Future Daily Alibi is not available");
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ALIBI_USE_DEVELOPMENT_FIXTURE === "true"
  ) {
    console.warn(
      `[Daily Alibi] Explicit development fixture for ${date}; database assignment bypassed.`,
    );
    return { ...dailyAlibi, challengeDate: date };
  }
  const db = getDb();
  if (!db)
    throw new AlibiUnavailableError(
      `Daily Alibi ${date}: DATABASE_URL is required`,
    );
  const [row] = await db
    .select({ challenge: dailyChallenges, content: alibiCases })
    .from(dailyChallenges)
    .innerJoin(games, eq(dailyChallenges.gameId, games.id))
    .innerJoin(alibiCases, eq(alibiCases.challengeId, dailyChallenges.id))
    .where(
      and(
        eq(games.slug, "daily-alibi"),
        eq(dailyChallenges.challengeDate, date),
      ),
    )
    .limit(1);
  if (!row)
    throw new AlibiUnavailableError(
      `Daily Alibi ${date} is not prepared; run generate:alibi-dailies after migrations`,
    );
  const [clues, suspects] = await Promise.all([
    db
      .select()
      .from(alibiClues)
      .where(eq(alibiClues.challengeId, row.challenge.id))
      .orderBy(asc(alibiClues.clueNumber)),
    db
      .select()
      .from(alibiSuspects)
      .where(eq(alibiSuspects.challengeId, row.challenge.id))
      .orderBy(asc(alibiSuspects.suspectKey)),
  ]);
  if (
    clues.length < 4 ||
    suspects.length !== 4 ||
    suspects.filter((s) => s.isCorrect).length !== 1
  )
    throw new AlibiUnavailableError(
      `Daily Alibi ${date}: incomplete stored case`,
    );
  // Calendar eligibility is authoritative. The existing publisher stamps due
  // rows; a missed cron must not delay midnight rollover of prepared content.
  return {
    challengeDate: date,
    challengeNumber: row.challenge.challengeNumber,
    title: row.content.title,
    dek: row.content.dek,
    briefTitle: row.content.briefTitle,
    brief: row.content.brief,
    objective: row.content.objective,
    clues: clues.map((c) => c.clue),
    suspects: suspects.map((s) => ({
      key: s.suspectKey,
      initial: s.name[0],
      name: s.name,
      role: s.role,
      statement: s.statement,
      correct: s.isCorrect,
      explanation: s.explanation,
    })),
  };
}
