import { randomBytes } from "node:crypto";
import { PerfectStackGame } from "@/components/games/perfect-stack-game";
import {
  getPracticeStackSeed,
  isStackDifficulty,
  validPublicSeed,
} from "@/lib/games/perfect-stack";
import { getDailyStackPuzzle } from "@/lib/games/perfect-stack/daily";
import { generateStackPuzzle } from "@/lib/games/perfect-stack/generator";
export const metadata = { title: "Perfect Stack | SKG Games" };
export const dynamic = "force-dynamic";
export default async function PerfectStackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams,
    difficulty = isStackDifficulty(query.difficulty)
      ? query.difficulty
      : "small";
  if (query.mode === "practice") {
    const seed =
      query.seed && validPublicSeed(query.seed)
        ? query.seed
        : randomBytes(5).toString("hex").toUpperCase();
    const puzzle = generateStackPuzzle(
      difficulty,
      getPracticeStackSeed(seed, difficulty),
    ).publicPuzzle;
    return (
      <PerfectStackGame
        key={`${difficulty}:${seed}`}
        puzzle={{ ...puzzle, seed }}
      />
    );
  }
  const puzzle = await getDailyStackPuzzle(difficulty);
  return <PerfectStackGame key={puzzle.seed} puzzle={puzzle} />;
}
