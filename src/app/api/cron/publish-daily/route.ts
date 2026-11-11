import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { publishDueChallenges } from "@/lib/db/challenges";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const started = performance.now();
  let count: number;
  try {
    count = await publishDueChallenges();
  } catch (error) {
    Sentry.logger.error("Daily puzzle publishing failed", {
      operation: "publish_daily",
      feature: "daily_puzzles",
      outcome: "unexpected_failure",
      status_code: 500,
      duration_ms: Math.round(performance.now() - started),
    });
    // Next.js onRequestError reports this exception; do not capture it again.
    throw error;
  }
  Sentry.logger.info("Daily puzzle publishing completed", {
    operation: "publish_daily",
    feature: "daily_puzzles",
    outcome: "success",
    status_code: 200,
    published_count: count,
    duration_ms: Math.round(performance.now() - started),
  });
  return NextResponse.json({
    ok: true,
    published: count,
    at: new Date().toISOString(),
  });
}
