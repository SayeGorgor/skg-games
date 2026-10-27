import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import {
  getPracticeStackSeed,
  isStackDifficulty,
  validPublicSeed,
} from "@/lib/games/perfect-stack";
import { generateStackPuzzle } from "@/lib/games/perfect-stack/generator";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams,
    difficulty = query.get("difficulty") ?? "small",
    seed = query.get("seed") ?? randomBytes(5).toString("hex").toUpperCase();
  if (!isStackDifficulty(difficulty) || !validPublicSeed(seed))
    return NextResponse.json(
      { error: "Invalid difficulty or seed" },
      { status: 400 },
    );
  try {
    const { publicPuzzle } = generateStackPuzzle(
      difficulty,
      getPracticeStackSeed(seed, difficulty),
    );
    return NextResponse.json(
      { ...publicPuzzle, seed },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Generation budget reached. Try another seed." },
      { status: 503 },
    );
  }
}
