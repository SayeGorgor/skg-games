import { beforeEach, describe, it, expect, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../db/schema";
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ getDb: vi.fn() }));
import { getDb } from "../db";
import { claimAnonymousProgress } from "./claim";
const id = "12345678-1234-4123-8123-123456789abc";
describe("transactional anonymous claim", () => {
  beforeEach(() => vi.resetAllMocks());
  it("rejects malformed identifiers before any database access", async () => {
    await expect(claimAnonymousProgress("user-1", "invalid")).rejects.toThrow(
      "Invalid anonymous identifier",
    );
    expect(getDb).not.toHaveBeenCalled();
  });
  it("retains local fallback without a database", async () => {
    vi.mocked(getDb).mockReturnValue(null);
    expect(await claimAnonymousProgress("user-1", id)).toEqual({
      persisted: false,
      claimed: false,
    });
  });
  it("uses an atomic batch, binds owner parameters, preserves finalized variants, and safely handles repeated claims", async () => {
    const db = drizzle("postgresql://unused:unused@localhost/unused", {
      schema,
    });
    vi.mocked(getDb).mockReturnValue(db);
    const batch = vi
      .spyOn(db, "batch")
      .mockResolvedValueOnce([
        [],
        [{ id: "attempt-1" }],
        [{ userId: "user-1" }],
      ])
      .mockResolvedValueOnce([[], [], [{ userId: "user-1" }]]);
    expect(await claimAnonymousProgress("user-1", id)).toEqual({
      persisted: true,
      claimed: true,
      associated: 1,
    });
    expect(await claimAnonymousProgress("user-1", id)).toEqual({
      persisted: true,
      claimed: true,
      associated: 0,
    });
    const queries = batch.mock.calls[0][0];
    expect(queries).toHaveLength(3);
    const compiled = queries.map((query) =>
      (
        query as unknown as { toSQL(): { sql: string; params: unknown[] } }
      ).toSQL(),
    );
    const [insert, update] = compiled;
    expect(insert.sql).toContain("on conflict do nothing");
    expect(update.sql).toContain("AND EXISTS");
    expect(update.sql).toContain("NOT EXISTS");
    expect(update.sql).toContain(
      "owned.variant IS NOT DISTINCT FROM game_attempts.variant",
    );
    expect(update.sql).toContain("owned.status = 'completed'");
    expect(update.sql).toContain(
      "COALESCE(owned.moves, 2147483647) <= COALESCE(game_attempts.moves, 2147483647)",
    );
    expect(update.params).toContain(id);
    expect(update.params).toContain("user-1");
    expect(update.sql).not.toContain("user-1");
  });
  it("does not report ownership when another account already claimed the browser", async () => {
    const db = drizzle("postgresql://unused:unused@localhost/unused", {
      schema,
    });
    vi.mocked(getDb).mockReturnValue(db);
    vi.spyOn(db, "batch").mockResolvedValue([
      [],
      [],
      [{ userId: "someone-else" }],
    ]);
    expect(await claimAnonymousProgress("user-1", id)).toEqual({
      persisted: true,
      claimed: false,
      associated: 0,
    });
  });
});
