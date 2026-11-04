import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/viewer", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/db/attempts", () => ({ recordAttempt: vi.fn() }));
vi.mock("@/lib/results/server", () => ({ readAccountHistory: vi.fn() }));
vi.mock("@/lib/games/perfect-stack/daily", () => ({
  getDailyStackPuzzle: vi.fn(),
}));
import { getViewer } from "../auth/viewer";
import { accountKey } from "../auth/account-key";
import { recordAttempt } from "../db/attempts";
import { readAccountHistory } from "./server";
import { getDailyStackPuzzle } from "../games/perfect-stack/daily";
import { generateStackPuzzle } from "../games/perfect-stack/generator";
import { getPracticeStackSeed } from "../games/perfect-stack";
import { POST } from "../../app/api/games/complete/route";
import { GET } from "../../app/api/stats/route";
import type { GameResult } from "./shared";
const fixture = (patch: Partial<GameResult> = {}): GameResult => ({
  eventId: crypto.randomUUID(),
  gameSlug: "daily-alibi",
  mode: "daily",
  challengeDate: "2026-11-03",
  challengeNumber: 127,
  completedAt: "2026-11-03T15:00:00Z",
  solved: true,
  moves: null,
  durationMs: null,
  result: { suspect: "ava" },
  ...patch,
});
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://skg.test/api/games/complete", {
    method: "POST",
    headers: {
      origin: "https://skg.test",
      "Content-Type": "application/json",
      "X-SKG-Account": accountKey("account-A"),
      ...headers,
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ now: new Date("2026-11-03T16:00:00Z") });
  vi.mocked(getViewer).mockResolvedValue({
    userId: "account-A",
    authenticated: true,
    premium: false,
    name: null,
    email: null,
  });
  vi.mocked(recordAttempt).mockResolvedValue(true);
});
afterEach(() => vi.useRealTimers());
describe("authenticated completion and private history APIs", () => {
  it("rejects cross-origin writes before database access", async () => {
    expect(
      (await POST(request(fixture(), { origin: "https://attacker.test" })))
        .status,
    ).toBe(403);
    expect(getViewer).not.toHaveBeenCalled();
    expect(recordAttempt).not.toHaveBeenCalled();
  });
  it("requires a valid session and rejects an account switch mid-upload", async () => {
    vi.mocked(getViewer).mockResolvedValueOnce({
      userId: null,
      authenticated: false,
      premium: false,
      name: null,
      email: null,
    });
    expect((await POST(request(fixture()))).status).toBe(401);
    expect(
      (
        await POST(
          request(fixture(), { "X-SKG-Account": accountKey("account-B") }),
        )
      ).status,
    ).toBe(409);
    expect(recordAttempt).not.toHaveBeenCalled();
  });
  it("uses the authenticated user, recomputes Alibi outcome, and persists the stable event ID", async () => {
    const body = {
      ...fixture({ solved: true, result: { suspect: "marcus" } }),
      userId: "victim",
    };
    expect((await POST(request(body))).status).toBe(200);
    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "account-A",
        solved: false,
        clientEventId: body.eventId,
        challengeDate: "2026-11-03",
        verified: true,
      }),
    );
  });
  it("rejects malformed, oversized and incomplete results", async () => {
    expect(
      (await POST(request({ ...fixture(), completedAt: "invalid" }))).status,
    ).toBe(400);
    expect(
      (await POST(request({ ...fixture(), extra: "a".repeat(33000) }))).status,
    ).toBe(413);
    expect(
      (await POST(request({ gameSlug: "perfect-stack", solved: false })))
        .status,
    ).toBe(400);
    expect(recordAttempt).not.toHaveBeenCalled();
  });
  it("validates Practice boards and recomputes stars without trusting the client", async () => {
    const seed = "history-check";
    const generated = generateStackPuzzle(
      "small",
      getPracticeStackSeed(seed, "small"),
    );
    const body = fixture({
      gameSlug: "perfect-stack",
      mode: "practice",
      difficulty: "small",
      challengeDate: null,
      challengeNumber: null,
      puzzleSeed: seed,
      moves: 5,
      durationMs: 12000,
      result: { placements: generated.canonicalSolution, stars: 1 },
    });
    expect((await POST(request(body))).status).toBe(200);
    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        verified: true,
        result: expect.objectContaining({ stars: 3 }),
      }),
    );
    expect(
      (await POST(request({ ...body, result: { placements: [] } }))).status,
    ).toBe(400);
  });
  it("validates queued daily Stack boards against their original date, not today", async () => {
    const generated = generateStackPuzzle("small", "queued-date", {
      mode: "daily",
      challengeDate: "2026-11-01",
      challengeNumber: 134,
    });
    vi.mocked(getDailyStackPuzzle).mockResolvedValue(generated.publicPuzzle);
    const body = fixture({
      gameSlug: "perfect-stack",
      difficulty: "small",
      challengeDate: "2026-11-01",
      challengeNumber: 134,
      puzzleSeed: generated.publicPuzzle.seed,
      moves: 5,
      durationMs: 5000,
      result: { placements: generated.canonicalSolution },
    });
    expect((await POST(request(body))).status).toBe(200);
    expect(getDailyStackPuzzle).toHaveBeenCalledWith("small", "2026-11-01");
  });
  it("keeps missing-board legacy records explicitly unverified and missing timestamps null", async () => {
    const body = fixture({
      gameSlug: "perfect-stack",
      difficulty: "small",
      completedAt: null,
      puzzleSeed: "legacy",
      moves: 8,
      durationMs: 10000,
      result: {},
    });
    expect((await POST(request(body))).status).toBe(200);
    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ verified: false, completedAt: null }),
    );
  });
  it("returns retryable errors when persistence fails", async () => {
    vi.mocked(recordAttempt)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("offline"));
    expect((await POST(request(fixture()))).status).toBe(503);
    expect((await POST(request(fixture()))).status).toBe(503);
  });
  it("reads only the current account and returns private paginated history", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      ...fixture({
        mode: "practice",
        challengeDate: null,
        challengeNumber: null,
      }),
      eventId: `event-${i}`,
      verified: false,
    }));
    vi.mocked(readAccountHistory).mockResolvedValue(rows);
    const response = await GET(
      new Request("https://skg.test/api/stats?page=2"),
    );
    const body = await response.json();
    expect(readAccountHistory).toHaveBeenCalledWith("account-A");
    expect(body.results).toHaveLength(5);
    expect(body.total).toBe(30);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(
      (await GET(new Request("https://skg.test/api/stats?userId=victim")))
        .status,
    ).toBe(400);
  });
  it("supports authenticated empty history and rejects unauthenticated reads", async () => {
    vi.mocked(readAccountHistory).mockResolvedValue([]);
    expect(
      await (await GET(new Request("https://skg.test/api/stats"))).json(),
    ).toMatchObject({ results: [], summary: { total: 0 } });
    vi.mocked(getViewer).mockResolvedValue({
      userId: null,
      authenticated: false,
      premium: false,
      name: null,
      email: null,
    });
    expect((await GET(new Request("https://skg.test/api/stats"))).status).toBe(
      401,
    );
  });
});
