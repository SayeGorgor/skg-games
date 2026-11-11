import "server-only";
import * as Sentry from "@sentry/nextjs";

export const metricNames = {
  persistenceAttempts: "skg.game_result.persistence_attempts",
  persistenceDuration: "skg.game_result.persistence_duration",
  puzzleLoadFailures: "skg.game_result.puzzle_load_failures",
  claimFailures: "skg.anonymous_progress.claim_failures",
  historyReadFailures: "skg.stats.history_read_failures",
  publishingRuns: "skg.daily_publishing.runs",
  publishingDuration: "skg.daily_publishing.duration",
  publishedChallenges: "skg.daily_publishing.published_challenges",
} as const;

type MetricName = (typeof metricNames)[keyof typeof metricNames];
export type GameMetricAttributes = {
  game_slug: "perfect-stack" | "daily-alibi";
  mode: "daily" | "practice";
  difficulty?: "small" | "medium" | "hard";
};
type MetricAttributes = Partial<GameMetricAttributes> & {
  feature: "game_completion" | "anonymous_progress" | "stats" | "daily_puzzles";
  operation:
    | "record_attempt"
    | "load_puzzle"
    | "claim_progress"
    | "read_history"
    | "publish_daily";
  outcome: "success" | "deferred" | "error";
};

// Copy only bounded, approved attributes, including at runtime. Never spread a
// request, log attributes, exception, or database result into metrics.
const allowed = {
  feature: ["game_completion", "anonymous_progress", "stats", "daily_puzzles"],
  operation: [
    "record_attempt",
    "load_puzzle",
    "claim_progress",
    "read_history",
    "publish_daily",
  ],
  outcome: ["success", "deferred", "error"],
  game_slug: ["perfect-stack", "daily-alibi"],
  mode: ["daily", "practice"],
  difficulty: ["small", "medium", "hard"],
};
function safeAttributes(attributes: MetricAttributes): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const key of Object.keys(allowed) as (keyof typeof allowed)[]) {
    const value = attributes[key];
    if (typeof value === "string" && allowed[key].includes(value))
      safe[key] = value;
  }
  return safe;
}

export function countMetric(
  name: MetricName,
  attributes: MetricAttributes,
  value = 1,
): void {
  try {
    if (Number.isSafeInteger(value) && value > 0)
      Sentry.metrics.count(name, value, {
        attributes: safeAttributes(attributes),
      });
  } catch {
    // Telemetry must never affect persistence, responses, or error propagation.
  }
}
function durationMetric(
  name: MetricName,
  duration: number,
  attributes: MetricAttributes,
): void {
  try {
    if (Number.isFinite(duration) && duration >= 0)
      Sentry.metrics.distribution(name, duration, {
        unit: "millisecond",
        attributes: safeAttributes(attributes),
      });
  } catch {
    // Best effort; do not recursively report telemetry failures.
  }
}

/** Acknowledgments include duplicates/backfills; this is not a completion count. */
export async function measurePersistence(
  persist: () => Promise<boolean>,
  game: GameMetricAttributes,
): Promise<boolean> {
  const started = performance.now();
  let outcome: MetricAttributes["outcome"] = "error";
  try {
    const acknowledged = await persist();
    outcome = acknowledged ? "success" : "deferred";
    return acknowledged;
  } finally {
    const duration = performance.now() - started;
    const attributes: MetricAttributes = {
      ...game,
      feature: "game_completion",
      operation: "record_attempt",
      outcome,
    };
    countMetric(metricNames.persistenceAttempts, attributes);
    durationMetric(metricNames.persistenceDuration, duration, attributes);
  }
}

export function recordPublishing(
  outcome: "success" | "error",
  duration: number,
  published = 0,
): void {
  const attributes: MetricAttributes = {
    feature: "daily_puzzles",
    operation: "publish_daily",
    outcome,
  };
  countMetric(metricNames.publishingRuns, attributes);
  durationMetric(metricNames.publishingDuration, duration, attributes);
  if (outcome === "success")
    countMetric(metricNames.publishedChallenges, attributes, published);
}
