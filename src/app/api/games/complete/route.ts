import { NextResponse } from "next/server";
import { recordAttempt } from "@/lib/db/attempts";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as null | {
    gameSlug?: string;
    challengeNumber?: number;
    solved?: boolean;
    durationMs?: number;
    moves?: number;
    anonymousId?: string;
    result?: unknown;
  };

  if (
    !body?.gameSlug ||
    !Number.isInteger(body.challengeNumber) ||
    typeof body.solved !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Invalid completion payload" },
      { status: 400 },
    );
  }

  const persisted = await recordAttempt({
    gameSlug: body.gameSlug,
    challengeNumber: body.challengeNumber!,
    solved: body.solved,
    durationMs: body.durationMs ?? null,
    moves: body.moves ?? null,
    anonymousId: body.anonymousId ?? null,
    result: body.result ?? {},
  });

  return NextResponse.json({ ok: true, persisted });
}
