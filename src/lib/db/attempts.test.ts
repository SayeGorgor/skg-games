import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("./index", () => ({ getDb: vi.fn() }));
import { getDb } from "./index";
import { recordAttempt } from "./attempts";
const input = {
  gameSlug: "daily-alibi",
  mode: "daily" as const,
  challengeNumber: 127,
  challengeDate: "2026-11-03",
  solved: false,
  moves: null,
  durationMs: null,
  anonymousId: null,
  userId: "account-A",
  result: { suspect: "marcus" },
  clientEventId: "12345678-1234-4123-8123-123456789abc",
  resultKey: "daily-alibi:2026-11-03:default",
  completedAt: "2026-11-03T15:00:00.000Z",
  verified: true,
};
beforeEach(() => vi.resetAllMocks());
describe("database completion writer", () => {
  it("fails safely without configured persistence", async () => {
    vi.mocked(getDb).mockReturnValue(null);
    expect(await recordAttempt(input)).toBe(false);
  });
  it("writes an immutable completion, ignores uniqueness conflicts, and confirms only the current owner's receipt", async () => {
    const where = vi.fn();
    const values = vi.fn();
    const conflict = vi.fn().mockResolvedValue(undefined);
    const rows = [
      [{ id: "game" }],
      [{ id: "challenge" }],
      [{ id: "owned" }],
      [{ id: "game" }],
      [{ id: "challenge" }],
      [],
    ];
    const db = {
      select: vi.fn(() => ({
        from: () => ({
          where: (condition: unknown) => {
            where(condition);
            return { limit: () => Promise.resolve(rows.shift()) };
          },
        }),
      })),
      insert: vi.fn(() => ({
        values: (row: unknown) => {
          values(row);
          return { onConflictDoNothing: conflict };
        },
      })),
    };
    vi.mocked(getDb).mockReturnValue(
      db as unknown as NonNullable<ReturnType<typeof getDb>>,
    );
    expect(await recordAttempt(input)).toBe(true);
    expect(await recordAttempt(input)).toBe(false);
    expect(conflict).toHaveBeenCalledTimes(2);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "account-A",
        clientEventId: input.clientEventId,
        completedAt: new Date(input.completedAt),
      }),
    );
    const query = new PgDialect().sqlToQuery(where.mock.calls[2][0]);
    expect(query.sql).toContain('"game_attempts"."user_id"');
    expect(query.params).toContain("account-A");
    expect(query.params).toContain(input.clientEventId);
  });
});
