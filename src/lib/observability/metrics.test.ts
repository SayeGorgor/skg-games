import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  metrics: { count: vi.fn(), distribution: vi.fn(), gauge: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/auth/viewer", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/db/attempts", () => ({ recordAttempt: vi.fn() }));
vi.mock("@/lib/db/challenges", () => ({ publishDueChallenges: vi.fn() }));
vi.mock("@/lib/auth/claim", () => ({ claimAnonymousProgress: vi.fn() }));
vi.mock("@/lib/results/server", () => ({ readAccountHistory: vi.fn() }));
vi.mock("@/lib/games/perfect-stack/daily", () => ({
  getDailyStackPuzzle: vi.fn(),
}));
vi.mock("@/lib/games/daily-alibi/daily", () => ({
  getDailyAlibiChallenge: vi.fn(),
}));
import { getViewer } from "@/lib/auth/viewer";
import { recordAttempt } from "@/lib/db/attempts";
import { publishDueChallenges } from "@/lib/db/challenges";
import { claimAnonymousProgress } from "@/lib/auth/claim";
import { readAccountHistory } from "@/lib/results/server";
import { getDailyStackPuzzle } from "@/lib/games/perfect-stack/daily";
import { getDailyAlibiChallenge } from "@/lib/games/daily-alibi/daily";
import { accountKey } from "@/lib/auth/account-key";
import { POST as complete } from "@/app/api/games/complete/route";
import { POST as claim } from "@/app/api/auth/claim-anonymous/route";
import { GET as stats } from "@/app/api/stats/route";
import { GET as publish } from "@/app/api/cron/publish-daily/route";
import { countMetric, metricNames, measurePersistence } from "./metrics";

const privateValue =
  "private@example.com cookie=secret SQL parameters OAuth token";
const eventId = "12345678-1234-4123-8123-123456789abc";
const result = {
  eventId,
  gameSlug: "perfect-stack",
  mode: "practice",
  difficulty: "small",
  challengeDate: null,
  challengeNumber: null,
  completedAt: null,
  solved: true,
  moves: 10,
  durationMs: 123456,
  puzzleSeed: "safe-seed",
  result: {},
  extra: privateValue,
};
function post(path: string, body: unknown = result) {
  return new Request(`https://example.com${path}`, {
    method: "POST",
    headers: {
      origin: "https://example.com",
      "X-SKG-Account": accountKey("private-user"),
    },
    body: JSON.stringify(body),
  });
}
function cron(authorized = true) {
  return new Request("https://example.com/api/cron/publish-daily", {
    headers: authorized ? { authorization: "Bearer private-cron-secret" } : {},
  });
}
const gameAttributes = {
  feature: "game_completion",
  operation: "record_attempt",
  game_slug: "perfect-stack",
  mode: "practice",
  difficulty: "small",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "private-cron-secret");
  vi.mocked(getViewer).mockResolvedValue({ userId: "private-user" } as Awaited<
    ReturnType<typeof getViewer>
  >);
});
afterEach(() => {
  const calls = [
    ...vi.mocked(Sentry.metrics.count).mock.calls,
    ...vi.mocked(Sentry.metrics.distribution).mock.calls,
  ];
  const serialized = JSON.stringify(calls);
  for (const secret of [
    privateValue,
    "private-user",
    accountKey("private-user"),
    eventId,
    "safe-seed",
    "private-cron-secret",
    "123456",
  ])
    expect(serialized).not.toContain(secret);
  const allowedKeys = [
    "feature",
    "operation",
    "game_slug",
    "mode",
    "difficulty",
    "outcome",
  ];
  for (const [, , options] of calls)
    for (const key of Object.keys(options?.attributes ?? {}))
      expect(allowedKeys).toContain(key);
  for (const [, duration, options] of vi.mocked(Sentry.metrics.distribution)
    .mock.calls) {
    expect(Number.isFinite(duration)).toBe(true);
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(options?.unit).toBe("millisecond");
  }
  expect(Sentry.metrics.gauge).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("persistence", () => {
  it.each([
    [true, "success", 200],
    [false, "deferred", 503],
  ] as const)(
    "records acknowledgment %s as %s",
    async (ack, outcome, status) => {
      vi.mocked(recordAttempt).mockResolvedValue(ack);
      const response = await complete(post("/api/games/complete"));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ ok: ack, persisted: ack });
      expect(Sentry.metrics.count).toHaveBeenCalledExactlyOnceWith(
        metricNames.persistenceAttempts,
        1,
        { attributes: { ...gameAttributes, outcome } },
      );
      expect(Sentry.metrics.distribution).toHaveBeenCalledExactlyOnceWith(
        metricNames.persistenceDuration,
        expect.any(Number),
        { unit: "millisecond", attributes: { ...gameAttributes, outcome } },
      );
    },
  );
  it("counts thrown persistence failures and retains the fallback", async () => {
    vi.mocked(recordAttempt).mockRejectedValue(new Error(privateValue));
    const response = await complete(post("/api/games/complete"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ persisted: false });
    expect(Sentry.metrics.count).toHaveBeenCalledExactlyOnceWith(
      metricNames.persistenceAttempts,
      1,
      { attributes: { ...gameAttributes, outcome: "error" } },
    );
    expect(Sentry.metrics.distribution).toHaveBeenCalledOnce();
  });
  it("counts repeated acknowledgments without claiming unique completions", async () => {
    vi.mocked(recordAttempt).mockResolvedValue(true);
    await complete(post("/api/games/complete"));
    await complete(post("/api/games/complete"));
    expect(Sentry.metrics.count).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(Sentry.metrics.count)
        .mock.calls.every(([name]) => name === metricNames.persistenceAttempts),
    ).toBe(true);
  });
  it("measures only the persistence callback with a monotonic clock", async () => {
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const body = {
      ...result,
      gameSlug: "daily-alibi",
      mode: "daily",
      challengeDate: "2026-01-01",
      challengeNumber: 1,
      result: { suspect: "suspect" },
    };
    vi.mocked(getDailyAlibiChallenge).mockImplementation(async () => {
      clock += 500;
      return {
        challengeNumber: 1,
        suspects: [{ key: "suspect", correct: true }],
      } as Awaited<ReturnType<typeof getDailyAlibiChallenge>>;
    });
    vi.mocked(recordAttempt).mockImplementation(async () => {
      clock += 7;
      return true;
    });
    expect((await complete(post("/api/games/complete", body))).status).toBe(
      200,
    );
    expect(Sentry.metrics.distribution).toHaveBeenCalledWith(
      metricNames.persistenceDuration,
      7,
      expect.objectContaining({ unit: "millisecond" }),
    );
  });
  it.each(["perfect-stack", "daily-alibi"] as const)(
    "counts %s load failures separately",
    async (gameSlug) => {
      vi.mocked(getDailyStackPuzzle).mockRejectedValue(new Error(privateValue));
      vi.mocked(getDailyAlibiChallenge).mockRejectedValue(
        new Error(privateValue),
      );
      const body = {
        ...result,
        gameSlug,
        mode: "daily",
        challengeDate: "2026-01-01",
        challengeNumber: 1,
        difficulty: gameSlug === "daily-alibi" ? privateValue : "small",
        result:
          gameSlug === "daily-alibi"
            ? { suspect: privateValue }
            : { placements: [] },
      };
      expect((await complete(post("/api/games/complete", body))).status).toBe(
        503,
      );
      expect(recordAttempt).not.toHaveBeenCalled();
      expect(Sentry.metrics.distribution).not.toHaveBeenCalled();
      expect(Sentry.metrics.count).toHaveBeenCalledExactlyOnceWith(
        metricNames.puzzleLoadFailures,
        1,
        {
          attributes: {
            feature: "game_completion",
            operation: "load_puzzle",
            outcome: "error",
            game_slug: gameSlug,
            mode: "daily",
            ...(gameSlug === "perfect-stack" ? { difficulty: "small" } : {}),
          },
        },
      );
    },
  );
  it("does not count authorization or validation failures", async () => {
    expect(
      (
        await complete(
          new Request("https://example.com/api/games/complete", {
            method: "POST",
          }),
        )
      ).status,
    ).toBe(403);
    expect((await complete(post("/api/games/complete", {}))).status).toBe(400);
    expect(
      (
        await complete(
          post("/api/games/complete", { ...result, puzzleSeed: "!" }),
        )
      ).status,
    ).toBe(400);
    const changed = post("/api/games/complete");
    changed.headers.set("X-SKG-Account", "wrong");
    expect((await complete(changed)).status).toBe(409);
    vi.mocked(getViewer).mockResolvedValue({ userId: null } as Awaited<
      ReturnType<typeof getViewer>
    >);
    expect((await complete(post("/api/games/complete"))).status).toBe(401);
    expect(recordAttempt).not.toHaveBeenCalled();
    expect(Sentry.metrics.count).not.toHaveBeenCalled();
    expect(Sentry.metrics.distribution).not.toHaveBeenCalled();
  });
});
it("counts only actual claim failures, not repeated or unavailable transfers", async () => {
  vi.mocked(claimAnonymousProgress)
    .mockRejectedValueOnce(new Error(privateValue))
    .mockResolvedValueOnce({ persisted: true, claimed: true, associated: 0 })
    .mockResolvedValueOnce({ persisted: false, claimed: false });
  const request = () =>
    post("/api/auth/claim-anonymous", { anonymousId: eventId });
  expect((await claim(request())).status).toBe(503);
  expect((await claim(request())).status).toBe(200);
  expect((await claim(request())).status).toBe(200);
  expect(
    (await claim(post("/api/auth/claim-anonymous", { anonymousId: "invalid" })))
      .status,
  ).toBe(400);
  expect(Sentry.metrics.count).toHaveBeenCalledExactlyOnceWith(
    metricNames.claimFailures,
    1,
    {
      attributes: {
        feature: "anonymous_progress",
        operation: "claim_progress",
        outcome: "error",
      },
    },
  );
});
it("counts valid history failures, preserving private no-store, with quiet normal reads", async () => {
  vi.mocked(readAccountHistory)
    .mockRejectedValueOnce(new Error(privateValue))
    .mockResolvedValueOnce([]);
  const request = (query = "") =>
    new Request(`https://example.com/api/stats${query}`);
  const response = await stats(request());
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect((await stats(request())).status).toBe(200);
  expect((await stats(request("?page=-1"))).status).toBe(400);
  vi.mocked(getViewer).mockResolvedValue({ userId: null } as Awaited<
    ReturnType<typeof getViewer>
  >);
  expect((await stats(request())).status).toBe(401);
  expect(Sentry.metrics.count).toHaveBeenCalledExactlyOnceWith(
    metricNames.historyReadFailures,
    1,
    {
      attributes: {
        feature: "stats",
        operation: "read_history",
        outcome: "error",
      },
    },
  );
});
it.each([0, 3])(
  "counts authorized publishing with %s publications",
  async (published) => {
    vi.mocked(publishDueChallenges).mockResolvedValue(published);
    expect((await publish(cron())).status).toBe(200);
    const attributes = {
      feature: "daily_puzzles",
      operation: "publish_daily",
      outcome: "success",
    };
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      metricNames.publishingRuns,
      1,
      { attributes },
    );
    expect(Sentry.metrics.count).toHaveBeenCalledTimes(published > 0 ? 2 : 1);
    if (published)
      expect(Sentry.metrics.count).toHaveBeenCalledWith(
        metricNames.publishedChallenges,
        published,
        { attributes },
      );
    expect(Sentry.metrics.distribution).toHaveBeenCalledExactlyOnceWith(
      metricNames.publishingDuration,
      expect.any(Number),
      { attributes, unit: "millisecond" },
    );
  },
);
it("does not count unauthorized or unconfigured cron invocations", async () => {
  expect((await publish(cron(false))).status).toBe(401);
  vi.stubEnv("CRON_SECRET", "");
  expect((await publish(cron())).status).toBe(401);
  expect(publishDueChallenges).not.toHaveBeenCalled();
  expect(Sentry.metrics.count).not.toHaveBeenCalled();
  expect(Sentry.metrics.distribution).not.toHaveBeenCalled();
});
it("counts failed publishing and rethrows the same error without published counts", async () => {
  const error = new Error(privateValue);
  vi.mocked(publishDueChallenges).mockRejectedValue(error);
  await expect(publish(cron())).rejects.toBe(error);
  expect(Sentry.metrics.count).toHaveBeenCalledExactlyOnceWith(
    metricNames.publishingRuns,
    1,
    {
      attributes: {
        feature: "daily_puzzles",
        operation: "publish_daily",
        outcome: "error",
      },
    },
  );
  expect(Sentry.metrics.distribution).toHaveBeenCalledOnce();
});
it("isolates telemetry exceptions from results, original errors, and independent metrics", async () => {
  vi.mocked(Sentry.metrics.count).mockImplementation(() => {
    throw new Error("telemetry failure");
  });
  const game = { game_slug: "perfect-stack", mode: "practice" } as const;
  expect(await measurePersistence(async () => true, game)).toBe(true);
  expect(Sentry.metrics.distribution).toHaveBeenCalledOnce();
  vi.mocked(Sentry.metrics.distribution).mockImplementation(() => {
    throw new Error("telemetry failure");
  });
  expect(await measurePersistence(async () => false, game)).toBe(false);
  const error = new Error(privateValue);
  await expect(
    measurePersistence(async () => {
      throw error;
    }, game),
  ).rejects.toBe(error);
  vi.mocked(publishDueChallenges).mockResolvedValue(3);
  expect((await publish(cron())).status).toBe(200);
  vi.mocked(publishDueChallenges).mockRejectedValue(error);
  await expect(publish(cron())).rejects.toBe(error);
});
it("drops unsafe attributes at runtime and ignores invalid counter values", () => {
  const attributes = {
    feature: "stats",
    operation: "read_history",
    outcome: "error",
    user_id: privateValue,
    difficulty: privateValue,
  };
  countMetric(
    metricNames.historyReadFailures,
    attributes as Parameters<typeof countMetric>[1],
  );
  expect(Sentry.metrics.count).toHaveBeenCalledExactlyOnceWith(
    metricNames.historyReadFailures,
    1,
    {
      attributes: {
        feature: "stats",
        operation: "read_history",
        outcome: "error",
      },
    },
  );
  for (const value of [0, -1, NaN, Infinity])
    countMetric(
      metricNames.historyReadFailures,
      attributes as Parameters<typeof countMetric>[1],
      value,
    );
  expect(Sentry.metrics.count).toHaveBeenCalledOnce();
});
