import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { games } from "../src/lib/db/schema";

const db = getDb();
if (!db) throw new Error("DATABASE_URL is required for seeding");
for (const game of [
  {
    slug: "daily-alibi",
    name: "Daily Alibi",
    description: "Solve a compact daily mystery.",
  },
  {
    slug: "perfect-stack",
    name: "Perfect Stack",
    description: "Use every piece. Fill every square.",
  },
]) {
  const existing = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.slug, game.slug))
    .limit(1);
  if (!existing.length) await db.insert(games).values(game);
}
console.log("Seeded SKG Games catalog");
