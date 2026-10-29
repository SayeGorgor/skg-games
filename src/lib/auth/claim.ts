import "server-only";
import { sql, eq } from "drizzle-orm";
import { getDb } from "../db";
import { anonymousClaims, gameAttempts } from "../db/schema";
import { validAnonymousId } from "./flow";

/** Preserve finalized Alibi accusations and equivalent/better Stack results.
 * Better anonymous Stack attempts join account history without deleting any row. */
export async function claimAnonymousProgress(
  userId: string,
  anonymousId: string,
) {
  if (!validAnonymousId(anonymousId))
    throw new Error("Invalid anonymous identifier");
  const db = getDb();
  if (!db) return { persisted: false, claimed: false };
  const [, moved, owners] = await db.batch([
    db
      .insert(anonymousClaims)
      .values({ anonymousId, userId })
      .onConflictDoNothing(),
    db
      .update(gameAttempts)
      .set({ userId })
      .where(
        sql`
      ${gameAttempts.anonymousId} = ${anonymousId}::uuid AND ${gameAttempts.userId} IS NULL
      AND EXISTS (SELECT 1 FROM anonymous_claims c WHERE c.anonymous_id = ${anonymousId}::uuid AND c.user_id = ${userId})
      AND (${gameAttempts.mode} = 'practice' OR NOT EXISTS (
        SELECT 1 FROM game_attempts owned WHERE owned.user_id = ${userId}
        AND owned.mode = 'daily' AND owned.game_slug = game_attempts.game_slug
        AND owned.challenge_number IS NOT DISTINCT FROM game_attempts.challenge_number
        AND owned.variant IS NOT DISTINCT FROM game_attempts.variant
        AND owned.status = 'completed'
        AND (game_attempts.game_slug <> 'perfect-stack'
          OR NOT game_attempts.solved
          OR (owned.solved AND COALESCE(owned.moves, 2147483647) <= COALESCE(game_attempts.moves, 2147483647)))
      ))`,
      )
      .returning({ id: gameAttempts.id }),
    db
      .select({ userId: anonymousClaims.userId })
      .from(anonymousClaims)
      .where(eq(anonymousClaims.anonymousId, anonymousId)),
  ]);
  return {
    persisted: true,
    claimed: owners[0]?.userId === userId,
    associated: moved.length,
  };
}
