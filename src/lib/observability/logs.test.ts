import { beforeEach, afterEach, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { beforeSendLog } from "./logs";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/auth/viewer", () => ({
  getViewer: vi.fn(async () => ({ userId: "private-user" })),
}));
vi.mock("@/lib/db/attempts", () => ({ recordAttempt: vi.fn() }));
vi.mock("@/lib/db/challenges", () => ({ publishDueChallenges: vi.fn() }));
vi.mock("@/lib/results/server", () => ({ readAccountHistory: vi.fn() }));
vi.mock("@/lib/auth/claim", () => ({ claimAnonymousProgress: vi.fn() }));

import { recordAttempt } from "@/lib/db/attempts";
import { publishDueChallenges } from "@/lib/db/challenges";
import { readAccountHistory } from "@/lib/results/server";
import { claimAnonymousProgress } from "@/lib/auth/claim";
import { accountKey } from "@/lib/auth/account-key";
import { POST as complete } from "@/app/api/games/complete/route";
import { POST as claim } from "@/app/api/auth/claim-anonymous/route";
import { GET as stats } from "@/app/api/stats/route";
import { GET as publish } from "@/app/api/cron/publish-daily/route";

const sensitive = "email@example.com token=secret raw database payload";

function request(path: string, body: unknown) {
  return new Request(`https://example.com${path}`, {
    method: "POST",
    headers: {
      origin: "https://example.com",
      "X-SKG-Account": accountKey("private-user"),
    },
    body: JSON.stringify(body),
  });
}

const result = {
  eventId: "12345678-1234-4123-8123-123456789abc",
  gameSlug: "perfect-stack",
  mode: "practice",
  difficulty: "small",
  challengeDate: null,
  challengeNumber: null,
  completedAt: null,
  solved: true,
  moves: 10,
  durationMs: 100,
  puzzleSeed: "safe-seed",
  result: {},
  email: sensitive,
};

beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  const logs = JSON.stringify([
    vi.mocked(Sentry.logger.info).mock.calls,
    vi.mocked(Sentry.logger.warn).mock.calls,
    vi.mocked(Sentry.logger.error).mock.calls,
  ]);
  for (const value of [
    sensitive,
    "private-user",
    accountKey("private-user"),
    result.eventId,
    "safe-seed",
  ])
    expect(logs).not.toContain(value);
  vi.unstubAllEnvs();
});

it("drops only production trace/debug logs", () => {
  vi.stubEnv("NODE_ENV", "production");
  for (const level of ["trace", "debug"] as const)
    expect(beforeSendLog({ level, message: "test" })).toBeNull();
  for (const level of ["info", "warn", "error", "fatal"] as const) {
    const log = { level, message: "test" };
    expect(beforeSendLog(log)).toBe(log);
  }
  vi.stubEnv("NODE_ENV", "development");
  expect(beforeSendLog({ level: "debug", message: "test" })).not.toBeNull();
});

it("warns for retryable persistence and errors for thrown failures without altering responses", async () => {
  vi.mocked(recordAttempt)
    .mockResolvedValueOnce(false)
    .mockRejectedValueOnce(new Error(sensitive));
    
  expect((await complete(request("/api/games/complete", result))).status).toBe(
    503,
  );
  expect(Sentry.logger.warn).toHaveBeenCalledWith(
    "Completion persistence deferred",
    expect.objectContaining({
      operation: "record_attempt",
      game_slug: "perfect-stack",
      mode: "practice",
      difficulty: "small",
      outcome: "retryable_failure",
      status_code: 503,
      duration_ms: expect.any(Number),
    }),
  );
  const response = await complete(request("/api/games/complete", result));

  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ persisted: false });
  expect(Sentry.logger.error).toHaveBeenCalledOnce();
});

it("does not log successful completion or rejected origin", async () => {
  vi.mocked(recordAttempt).mockResolvedValue(true);

  expect((await complete(request("/api/games/complete", result))).status).toBe(
    200,
  );
  expect(
    (
      await complete(
        new Request("https://example.com/api/games/complete", {
          method: "POST",
        }),
      )
    ).status,
  ).toBe(403);

  expect(Sentry.logger.info).not.toHaveBeenCalled();
  expect(Sentry.logger.warn).not.toHaveBeenCalled();
  expect(Sentry.logger.error).not.toHaveBeenCalled();
});

it("reports handled stats and claim failures safely", async () => {
  vi.mocked(readAccountHistory).mockRejectedValue(new Error(sensitive));

  expect(
    (await stats(new Request("https://example.com/api/stats"))).status,
  ).toBe(503);

  vi.mocked(claimAnonymousProgress).mockRejectedValue(new Error(sensitive));
  expect(
    (
      await claim(
        request("/api/auth/claim-anonymous", { anonymousId: result.eventId }),
      )
    ).status,
  ).toBe(503);

  expect(Sentry.logger.error).toHaveBeenCalledWith(
    "Account history retrieval failed",
    {
      operation: "read_history",
      feature: "stats",
      outcome: "unexpected_failure",
      status_code: 503,
    },
  );

  expect(Sentry.logger.error).toHaveBeenCalledWith(
    "Anonymous progress claim failed",
    {
      operation: "claim_progress",
      feature: "anonymous_progress",
      outcome: "unexpected_failure",
      status_code: 503,
    },
  );
});

it("publishes summaries, preserves authorization and propagates original failures", async () => {
  vi.stubEnv("CRON_SECRET", "secret");

  expect(
    (await publish(new Request("https://example.com/api/cron/publish-daily")))
      .status,
  ).toBe(401);
  expect(publishDueChallenges).not.toHaveBeenCalled();
  expect(Sentry.logger.info).not.toHaveBeenCalled();

  const authorized = () =>
    new Request("https://example.com/api/cron/publish-daily", {
      headers: { authorization: "Bearer secret" },
    });

  vi.mocked(publishDueChallenges).mockResolvedValue(3);

  expect((await publish(authorized())).status).toBe(200);
  expect(Sentry.logger.info).toHaveBeenCalledWith(
    "Daily puzzle publishing completed",
    {
      operation: "publish_daily",
      feature: "daily_puzzles",
      outcome: "success",
      status_code: 200,
      published_count: 3,
      duration_ms: expect.any(Number),
    },
  );

  const error = new Error(sensitive);
  vi.mocked(publishDueChallenges).mockRejectedValue(error);

  await expect(publish(authorized())).rejects.toBe(error);
  expect(Sentry.logger.error).toHaveBeenCalledWith(
    "Daily puzzle publishing failed",
    expect.objectContaining({
      status_code: 500,
      duration_ms: expect.any(Number),
    }),
  );
});

it("keeps successful stats reads quiet", async () => {
  vi.mocked(readAccountHistory).mockResolvedValue([]);

  expect(
    (await stats(new Request("https://example.com/api/stats"))).status,
  ).toBe(200);
  expect(Sentry.logger.info).not.toHaveBeenCalled();
  expect(Sentry.logger.error).not.toHaveBeenCalled();
});

it("summarizes zero publications too", async () => {
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  vi.mocked(publishDueChallenges).mockResolvedValue(0);

  expect(
    (await publish(
      new Request("https://example.com/api/cron/publish-daily", {
        headers: {
          Authorization: "Bearer test-cron-secret",
        },
      }),
    )).status,
  ).toBe(200);

  expect(Sentry.logger.info).toHaveBeenCalledWith(
    "Daily puzzle publishing completed",
    expect.objectContaining({ published_count: 0 }),
  );
});
