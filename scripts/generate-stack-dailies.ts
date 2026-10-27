import { and, eq } from "drizzle-orm";
import { getDb } from "../src/lib/db/index";
import { games, dailyChallenges, stackPuzzles } from "../src/lib/db/schema";
import { getGameDate } from "../src/lib/game-date";
import { getStackChallengeNumber } from "../src/lib/games/perfect-stack/daily";
import { generateDailyStackPuzzle } from "../src/lib/games/perfect-stack/generator";
async function main() {
  const index = process.argv.indexOf("--days"),
    days = index < 0 ? 30 : Number(process.argv[index + 1]);
  if (!Number.isInteger(days) || days < 1 || days > 366)
    throw new Error("--days must be 1–366");
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required");
  await db
    .insert(games)
    .values({
      slug: "perfect-stack",
      name: "Perfect Stack",
      description: "Use every piece. Fill every square.",
    })
    .onConflictDoNothing();
  const [game] = await db
    .select()
    .from(games)
    .where(eq(games.slug, "perfect-stack"));
  const reserved = new Set(
    (
      await db
        .select({ fingerprint: stackPuzzles.fingerprint })
        .from(stackPuzzles)
    ).map((p) => p.fingerprint),
  );
  for (let day = 0; day < days; day++) {
    const date = new Date(getGameDate() + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + day);
    const challengeDate = date.toISOString().slice(0, 10);
    const existing = await db
      .select()
      .from(dailyChallenges)
      .where(
        and(
          eq(dailyChallenges.gameId, game.id),
          eq(dailyChallenges.challengeDate, challengeDate),
        ),
      );
    // Continue existing numbering; epoch supplies the first challenge in an empty catalog.
    const [challenge] = existing.length
      ? existing
      : await db
          .insert(dailyChallenges)
          .values({
            gameId: game.id,
            challengeDate,
            challengeNumber: getStackChallengeNumber(challengeDate),
          })
          .onConflictDoNothing()
          .returning();
    if (!challenge)
      throw new Error(
        "Challenge date/number conflict; check epoch configuration",
      );
    for (const difficulty of ["small", "medium", "hard"] as const) {
      if (
        (
          await db
            .select({ id: stackPuzzles.id })
            .from(stackPuzzles)
            .where(
              and(
                eq(stackPuzzles.challengeId, challenge.id),
                eq(stackPuzzles.difficulty, difficulty),
              ),
            )
        ).length
      )
        continue;
      const generated = generateDailyStackPuzzle(
          challengeDate,
          difficulty,
          challenge.challengeNumber,
          reserved,
        ),
        p = generated.publicPuzzle;
      await db.insert(stackPuzzles).values({
        challengeId: challenge.id,
        difficulty,
        generatorVersion: 2,
        seed: p.seed,
        fingerprint: generated.fingerprint,
        rows: p.rows,
        cols: p.cols,
        pieces: p.pieces,
        canonicalSolution: generated.canonicalSolution,
        generationMetrics: generated.metrics,
        optimalPlacements: p.pieceCount,
      });
      reserved.add(generated.fingerprint);
      console.log(challengeDate, difficulty, generated.fingerprint);
    }
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
