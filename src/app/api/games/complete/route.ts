import { NextResponse } from "next/server";
import { recordAttempt } from "@/lib/db/attempts";
import { getDailyStackPuzzle } from "@/lib/games/perfect-stack/daily";
import { generateStackPuzzle } from "@/lib/games/perfect-stack/generator";
import {
  getPracticeStackSeed,
  getStackStars,
  isStackDifficulty,
  isStackSolved,
  validPublicSeed,
  type StackPlacement,
} from "@/lib/games/perfect-stack";
const integer = (v: unknown, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (
    !body ||
    !["daily-alibi", "perfect-stack"].includes(body.gameSlug) ||
    typeof body.solved !== "boolean" ||
    (body.durationMs !== undefined && !integer(body.durationMs, 2147483647)) ||
    (body.moves !== undefined && !integer(body.moves, 1000000)) ||
    (body.anonymousId !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.anonymousId,
      ))
  )
    return NextResponse.json(
      { error: "Invalid completion payload" },
      { status: 400 },
    );
  const mode = body.mode ?? "daily";
  if (body.gameSlug === "perfect-stack") {
    if (
      !["daily", "practice"].includes(mode) ||
      !isStackDifficulty(body.difficulty) ||
      typeof body.puzzleSeed !== "string" ||
      !integer(body.moves, 1000000) ||
      !integer(body.durationMs, 2147483647) ||
      (mode === "practice" &&
        (body.challengeNumber !== null || !validPublicSeed(body.puzzleSeed))) ||
      (mode === "daily" && !integer(body.challengeNumber, 2147483647))
    )
      return NextResponse.json(
        { error: "Invalid Stack metadata" },
        { status: 400 },
      );
    const placements: unknown = body.result?.placements;
    if (
      !Array.isArray(placements) ||
      placements.length > 13 ||
      !placements.every(
        (p) =>
          p &&
          typeof p.pieceId === "string" &&
          integer(p.rotation, 3) &&
          Array.isArray(p.cells) &&
          p.cells.length >= 4 &&
          p.cells.length <= 6 &&
          p.cells.every(
            (c: unknown) =>
              Array.isArray(c) &&
              c.length === 2 &&
              c.every((v) => integer(v, 7)),
          ),
      )
    )
      return NextResponse.json(
        { error: "Invalid placements" },
        { status: 400 },
      );
    try {
      const puzzle =
        mode === "daily"
          ? await getDailyStackPuzzle(body.difficulty)
          : generateStackPuzzle(
              body.difficulty,
              getPracticeStackSeed(body.puzzleSeed, body.difficulty),
            ).publicPuzzle;
      if (
        (mode === "daily" &&
          (puzzle.seed !== body.puzzleSeed ||
            puzzle.challengeNumber !== body.challengeNumber)) ||
        body.moves < puzzle.pieceCount ||
        !body.solved ||
        !isStackSolved(puzzle, placements as StackPlacement[])
      )
        return NextResponse.json(
          { error: "Invalid solution" },
          { status: 400 },
        );
      body.result = {
        placements,
        stars: getStackStars(body.moves, puzzle.pieceCount),
        extraMoves: Math.max(0, body.moves - puzzle.pieceCount),
      };
    } catch {
      return NextResponse.json(
        { error: "Puzzle unavailable" },
        { status: 503 },
      );
    }
  } else if (!integer(body.challengeNumber, 2147483647) || mode !== "daily")
    return NextResponse.json({ error: "Invalid challenge" }, { status: 400 });
  const persisted = await recordAttempt({
    gameSlug: body.gameSlug,
    mode,
    variant: body.difficulty,
    puzzleSeed: body.puzzleSeed,
    challengeNumber: body.challengeNumber,
    solved: body.solved,
    durationMs: body.durationMs ?? null,
    moves: body.moves ?? null,
    anonymousId: body.anonymousId ?? null,
    result: body.result ?? {},
  });
  return NextResponse.json({ ok: true, persisted });
}
