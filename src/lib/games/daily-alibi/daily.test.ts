import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../db", () => ({ getDb: vi.fn() }));
import { getDb } from "../../db";
import { getDailyAlibiChallenge } from "./daily";
import { alibiCatalog } from "./catalog";
import { toDailyAlibiCase } from "./types";

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ now: new Date("2026-11-04T16:00:00Z") });
  vi.stubEnv("ALIBI_USE_DEVELOPMENT_FIXTURE", "false");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe("database-backed Daily Alibi retrieval", () => {
  it("denies future cases before accessing the database, even when prepared", async () => {
    await expect(getDailyAlibiChallenge("2026-11-05")).rejects.toThrow(
      "Future Daily",
    );
    expect(getDb).not.toHaveBeenCalled();
  });
  it("does not mask missing production data with the bundled fixture", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALIBI_USE_DEVELOPMENT_FIXTURE", "true");
    vi.mocked(getDb).mockReturnValue(null);
    await expect(getDailyAlibiChallenge()).rejects.toThrow("DATABASE_URL");
  });
  it("reconstructs the seeded case and canonical answer from existing tables", async () => {
    const expected = toDailyAlibiCase(alibiCatalog[3], "2026-11-04", 880);
    const rows = [
      [
        {
          challenge: {
            id: "alibi-challenge",
            challengeNumber: 880,
            publishedAt: null,
          },
          content: expected,
        },
      ],
      expected.clues.map((clue, i) => ({ clue, clueNumber: i + 1 })),
      expected.suspects.map((s) => ({
        suspectKey: s.key,
        name: s.name,
        role: s.role,
        statement: s.statement,
        isCorrect: s.correct,
        explanation: s.explanation,
      })),
    ];
    const db = {
      select: () => {
        const result = rows.shift();
        const query = {
          from: () => query,
          innerJoin: () => query,
          where: () => query,
          limit: async () => result,
          orderBy: async () => result,
        };
        return query;
      },
    };
    vi.mocked(getDb).mockReturnValue(
      db as unknown as NonNullable<ReturnType<typeof getDb>>,
    );
    expect(await getDailyAlibiChallenge()).toEqual(expected);
  });
  it("requires explicit development fixture opt-in", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALIBI_USE_DEVELOPMENT_FIXTURE", "true");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await getDailyAlibiChallenge();
    expect(result.challengeDate).toBe("2026-11-04");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
