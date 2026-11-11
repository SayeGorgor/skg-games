import {
  countMetric,
  metricNames,
  measurePersistence,
  type GameMetricAttributes,
} from "@/lib/observability/metrics";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { recordAttempt } from "@/lib/db/attempts";
import { getViewer } from "@/lib/auth/viewer";
import { getDailyStackPuzzle } from "@/lib/games/perfect-stack/daily";
import { generateStackPuzzle } from "@/lib/games/perfect-stack/generator";
import {
  getPracticeStackSeed,
  getStackStars,
  validPublicSeed,
} from "@/lib/games/perfect-stack";
import { validCompletedStackPlacements } from "@/lib/games/perfect-stack/completion";
import { getDailyAlibiChallenge } from "@/lib/games/daily-alibi/daily";
import { parseResult, resultKey } from "@/lib/results/shared";
import { accountKey } from "@/lib/auth/account-key";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403 },
    );
  const viewer = await getViewer();
  if (!viewer.userId)
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (request.headers.get("X-SKG-Account") !== accountKey(viewer.userId))
    return NextResponse.json(
      { error: "Account changed; refresh before syncing" },
      { status: 409 },
    );
  const raw = await request.text();
  if (raw.length > 32768)
    return NextResponse.json({ error: "Result too large" }, { status: 413 });
  let body;
  try {
    body = parseResult(JSON.parse(raw));
  } catch {
    /* malformed input */
  }
  if (!body)
    return NextResponse.json(
      { error: "Invalid completion payload" },
      { status: 400 },
    );
  const started = performance.now();
  // Only validated enum values; never spread the completion payload into logs.
  const attributes = {
    feature: "game_completion",
    game_slug: body.gameSlug,
    mode: body.mode,
    ...(body.gameSlug === "perfect-stack"
      ? { difficulty: body.difficulty }
      : {}),
    status_code: 503,
  };
  const gameMetrics: GameMetricAttributes = {
    game_slug: body.gameSlug,
    mode: body.mode,
    ...(body.gameSlug === "perfect-stack"
      ? { difficulty: body.difficulty }
      : {}),
  };
  let verified = false;
  if (body.gameSlug === "perfect-stack") {
    if (body.mode === "practice" && !validPublicSeed(body.puzzleSeed!))
      return NextResponse.json(
        { error: "Invalid practice seed" },
        { status: 400 },
      );
    if (body.result.placements) {
      try {
        const puzzle =
          body.mode === "daily"
            ? await getDailyStackPuzzle(body.difficulty!, body.challengeDate!)
            : generateStackPuzzle(
                body.difficulty!,
                getPracticeStackSeed(body.puzzleSeed!, body.difficulty!),
              ).publicPuzzle;
        if (
          (body.mode === "daily" && puzzle.seed !== body.puzzleSeed) ||
          (body.mode === "daily" &&
            body.challengeNumber !== null &&
            puzzle.challengeNumber !== body.challengeNumber) ||
          body.moves! < puzzle.pieceCount ||
          !validCompletedStackPlacements(puzzle, body.result.placements)
        )
          return NextResponse.json(
            { error: "Invalid solution" },
            { status: 400 },
          );
        body.challengeNumber = puzzle.challengeNumber;
        body.result.stars = getStackStars(body.moves!, puzzle.pieceCount);
        verified = true;
      } catch {
        countMetric(metricNames.puzzleLoadFailures, {
          ...gameMetrics,
          feature: "game_completion",
          operation: "load_puzzle",
          outcome: "error",
        });
        Sentry.logger.warn("Completion puzzle unavailable", {
          ...attributes,
          operation: "load_puzzle",
          outcome: "retryable_failure",
          duration_ms: Math.round(performance.now() - started),
        });
        return NextResponse.json(
          { error: "Puzzle unavailable; retry later" },
          { status: 503 },
        );
      }
    }
    // Legacy local completions without boards remain explicitly unverified.
  } else {
    let alibi;
    try {
      alibi = await getDailyAlibiChallenge(body.challengeDate!);
    } catch {
      countMetric(metricNames.puzzleLoadFailures, {
        ...gameMetrics,
        feature: "game_completion",
        operation: "load_puzzle",
        outcome: "error",
      });
      Sentry.logger.warn("Completion case unavailable", {
        ...attributes,
        operation: "load_puzzle",
        outcome: "retryable_failure",
        duration_ms: Math.round(performance.now() - started),
      });
      return NextResponse.json(
        { error: "Case unavailable; retry later" },
        { status: 503 },
      );
    }
    if (body.challengeNumber !== alibi.challengeNumber)
      return NextResponse.json({ error: "Unknown case" }, { status: 400 });
    const suspect = alibi.suspects.find((s) => s.key === body.result.suspect);
    if (!suspect)
      return NextResponse.json({ error: "Unknown suspect" }, { status: 400 });
    body.solved = suspect.correct;
    verified = true;
  }
  try {
    const input = {
      ...body,
      clientEventId: body.eventId,
      resultKey: resultKey(body),
      variant: body.difficulty,
      anonymousId: null,
      userId: viewer.userId,
      verified,
    };
    const persisted = await measurePersistence(
      () => recordAttempt(input),
      gameMetrics,
    );
    if (!persisted)
      Sentry.logger.warn("Completion persistence deferred", {
        ...attributes,
        operation: "record_attempt",
        outcome: "retryable_failure",
        duration_ms: Math.round(performance.now() - started),
      });
    return NextResponse.json(
      { ok: persisted, persisted },
      { status: persisted ? 200 : 503 },
    );
  } catch {
    Sentry.logger.error("Completion persistence failed", {
      ...attributes,
      operation: "record_attempt",
      outcome: "unexpected_failure",
      duration_ms: Math.round(performance.now() - started),
    });
    return NextResponse.json(
      {
        error: "Results remain saved in this browser; retry later",
        persisted: false,
      },
      { status: 503 },
    );
  }
}
