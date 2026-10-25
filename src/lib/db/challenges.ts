import { and, isNull, lte } from "drizzle-orm";
import { getDb } from "./index";
import { dailyChallenges, publishRuns } from "./schema";
import { getGameDate } from "@/lib/game-date";

export async function publishDueChallenges() {
  const db = getDb();
  if (!db) return 0;
  const today = getGameDate();
  const rows = await db
    .update(dailyChallenges)
    .set({ publishedAt: new Date() })
    .where(
      and(
        lte(dailyChallenges.challengeDate, today),
        isNull(dailyChallenges.publishedAt),
      ),
    )
    .returning({ id: dailyChallenges.id });
  await db
    .insert(publishRuns)
    .values({ publishedCount: rows.length, notes: "scheduled publish" });
  return rows.length;
}
