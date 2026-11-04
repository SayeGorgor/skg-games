import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dailyAlibi } from "../games/alibi";
import { saveDailyAlibiResult } from "../client-progress";
import type { GameResult } from "./shared";
let local: typeof import("./local");
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
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(async () => {
  vi.useFakeTimers({ now: new Date("2026-11-03T16:00:00Z") });
  vi.resetModules();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("window", new EventTarget());
  local = await import("./local");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("durable completion queue and account isolation", () => {
  it("persists anonymous completions after module reload and deduplicates rerenders/daily replays", async () => {
    local.queueResult(fixture());
    local.queueResult(fixture());
    vi.resetModules();
    local = await import("./local");
    expect(local.localResults(null)).toHaveLength(1);
  });
  it("retains repeatable practice session history", () => {
    const patch = {
      gameSlug: "perfect-stack" as const,
      mode: "practice" as const,
      difficulty: "small" as const,
      challengeDate: null,
      challengeNumber: null,
      puzzleSeed: "test",
      moves: 5,
      durationMs: 1200,
      result: {},
    };
    expect(local.queueResult(fixture(patch))).toBe(true);
    local.queueResult(fixture(patch));
    expect(local.localResults(null)).toHaveLength(2);
  });
  it.each([
    "email registration",
    "Google login",
    "verified email sign-in",
    "direct existing-session login",
  ])("syncs guests for %s without relying on an auth route", async () => {
    local.queueResult(fixture());
    local.setResultActor("account-A");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ persisted: true, claimed: true }))
      .mockResolvedValueOnce(response({ persisted: true }));
    vi.stubGlobal("fetch", fetch);
    await local.syncResults("account-A");
    await local.syncResults("account-A");
    expect(fetch).toHaveBeenCalledTimes(2);
    const saved = JSON.parse(localStorage.getItem(local.RESULTS_KEY)!);
    expect(saved.entries[0]).toMatchObject({
      owner: "account-A",
      synced: true,
    });
    expect(local.localResults(null)).toHaveLength(0);
  });
  it("leaves failed uploads queued, retries with the same event ID, and binds them to their first account", async () => {
    const value = fixture();
    local.queueResult(value);
    local.setResultActor("account-A");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ persisted: true, claimed: true }))
      .mockResolvedValueOnce(response({ persisted: false }, 503));
    vi.stubGlobal("fetch", fetch);
    await expect(local.syncResults("account-A")).rejects.toThrow(
      "waiting to sync",
    );
    expect(
      JSON.parse(localStorage.getItem(local.RESULTS_KEY)!).entries[0].synced,
    ).toBe(false);
    local.setResultActor("account-B");
    await local.syncResults("account-B");
    expect(fetch).toHaveBeenCalledTimes(2);
    local.setResultActor("account-A");
    fetch.mockResolvedValueOnce(response({ persisted: true }));
    await local.syncResults("account-A");
    expect(JSON.parse(fetch.mock.calls[2][1].body).eventId).toBe(value.eventId);
  });
  it("coalesces concurrent sync attempts", async () => {
    local.setResultActor("account-A");
    local.queueResult(fixture());
    const fetch = vi.fn().mockResolvedValue(response({ persisted: true }));
    vi.stubGlobal("fetch", fetch);
    await Promise.all([
      local.syncResults("account-A"),
      local.syncResults("account-A"),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("claims legacy database-only guest history outside the auth completion page, once per group", async () => {
    localStorage.setItem(
      "skg-anonymous-id",
      "12345678-1234-4123-8123-123456789abc",
    );
    local.setResultActor("account-A");
    const fetch = vi
      .fn()
      .mockResolvedValue(
        response({ persisted: true, claimed: true, associated: 3 }),
      );
    vi.stubGlobal("fetch", fetch);
    expect(await local.syncResults("account-A")).toBe(true);
    expect(await local.syncResults("account-A")).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retains results and rotates the guest identity after logout", () => {
    local.setResultActor("account-A");
    local.queueResult(fixture());
    const before = localStorage.getItem(local.RESULTS_KEY);
    local.endResultSession();
    expect(localStorage.getItem(local.RESULTS_KEY)).toBe(before);
    expect(local.localResults(null)).toHaveLength(0);
    expect(local.localResults("account-B")).toHaveLength(0);
    expect(local.localResults("account-A")).toHaveLength(1);
  });
  it("refuses to upload a guest group claimed by another account", async () => {
    local.queueResult(fixture());
    local.setResultActor("account-B");
    const fetch = vi
      .fn()
      .mockResolvedValue(response({ persisted: true, claimed: false }));
    vi.stubGlobal("fetch", fetch);
    await expect(local.syncResults("account-B")).rejects.toThrow(
      "another account",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(local.localResults("account-B")).toHaveLength(0);
  });
  it("recovers quarantined guest results only when the server confirms ownership", async () => {
    local.queueResult(fixture());
    local.setResultActor("account-B");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ persisted: true, claimed: false }));
    vi.stubGlobal("fetch", fetch);
    await local.syncResults("account-B").catch(() => {});
    local.setResultActor("account-A");
    fetch
      .mockResolvedValueOnce(response({ persisted: true, claimed: true }))
      .mockResolvedValueOnce(response({ persisted: true }));
    await local.syncResults("account-A");
    expect(local.localResults("account-A")).toHaveLength(1);
  });
  it("handles blocked and malformed storage without interrupting gameplay", () => {
    localStorage.setItem(local.RESULTS_KEY, "broken");
    expect(local.localResults(null)).toEqual([]);
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    expect(local.queueResult(fixture())).toBe(false);
    expect(local.localResults(null)).toHaveLength(1);
    expect(local.storageUnavailable()).toBe(true);
  });
  it("migrates dated Alibi results without erasing existing progress or fabricating completion times", () => {
    const puzzle = { ...dailyAlibi, challengeDate: "2026-11-02" };
    saveDailyAlibiResult(puzzle, "ava");
    const original = localStorage.getItem("skg-progress-v1");
    local.migrateLocalResults();
    local.migrateLocalResults();
    expect(local.localResults(null)).toHaveLength(1);
    expect(local.localResults(null)[0].completedAt).toBe(
      "2026-11-03T16:00:00.000Z",
    );
    expect(localStorage.getItem("skg-progress-v1")).toBe(original);
  });
  it("imports dated legacy Stack metrics without inventing a seed or completion timestamp", () => {
    localStorage.setItem(
      "skg-stack-progress-v2",
      JSON.stringify({
        "2026-11-02": {
          date: "2026-11-02",
          difficulties: {
            small: { solved: true, stars: 3, moves: 5, durationMs: 12000 },
          },
        },
      }),
    );
    local.migrateLocalResults();
    expect(local.localResults(null)).toHaveLength(1);
    expect(local.localResults(null)[0]).toMatchObject({
      challengeDate: "2026-11-02",
      completedAt: null,
      moves: 5,
      durationMs: 12000,
    });
    expect(local.localResults(null)[0].puzzleSeed).toBeUndefined();
  });
});
