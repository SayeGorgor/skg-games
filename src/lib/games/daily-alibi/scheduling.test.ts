import { describe, expect, it } from "vitest";
import { getGameDate } from "../../game-date";
import { alibiCatalog } from "./catalog";
import {
  addCalendarDays,
  alibiCoverage,
  planAlibiDailies,
  type AlibiAssignment,
} from "./scheduling";
import {
  requireAlibiDatabaseUrl,
  seedAlibiDailies,
  type AlibiSeedStore,
} from "./seeding";

function memoryStore(initial: AlibiAssignment[] = []) {
  const rows = structuredClone(initial);
  const writes: string[] = [];
  const store: AlibiSeedStore = {
    read: async () => structuredClone(rows),
    insert: async (plan) => {
      for (const p of plan) {
        if (
          rows.some(
            (r) =>
              r.challengeDate === p.challengeDate ||
              r.caseId === p.entry.caseId ||
              r.fingerprint === p.fingerprint,
          )
        )
          throw new Error("unique constraint");
        rows.push({
          challengeDate: p.challengeDate,
          challengeNumber: p.challengeNumber,
          caseId: p.entry.caseId,
          fingerprint: p.fingerprint,
          complete: true,
        });
        writes.push(p.entry.caseId);
      }
      return plan.length;
    },
  };
  return { store, rows, writes };
}
describe("Daily Alibi scheduling", () => {
  it("uses deterministic unused inventory, skips assigned dates, and survives catalog reordering", async () => {
    const { store, rows } = memoryStore();
    const options = { start: "2026-11-04", days: 30 };
    expect(planAlibiDailies(alibiCatalog, [], options.start, 30)).toEqual(
      planAlibiDailies([...alibiCatalog].reverse(), [], options.start, 30),
    );
    expect(
      (await seedAlibiDailies(store, alibiCatalog, options)).inserted,
    ).toBe(30);
    const first = structuredClone(rows);
    expect(
      (await seedAlibiDailies(store, [...alibiCatalog].reverse(), options))
        .inserted,
    ).toBe(0);
    expect(rows).toEqual(first);
    expect(new Set(rows.map((r) => r.caseId)).size).toBe(30);
  });
  it("dry-run performs no mutations, including the game catalog", async () => {
    const { store, rows, writes } = memoryStore();
    const result = await seedAlibiDailies(store, alibiCatalog, {
      start: "2026-11-04",
      days: 30,
      dryRun: true,
    });
    expect(result.planned).toHaveLength(30);
    expect(rows).toEqual([]);
    expect(writes).toEqual([]);
  });
  it("fails before writes on exhaustion or incomplete legacy assignments", async () => {
    const { store, writes } = memoryStore();
    await expect(
      seedAlibiDailies(store, alibiCatalog, { start: "2026-11-04", days: 31 }),
    ).rejects.toThrow("1 additional cases");
    expect(writes).toEqual([]);
    expect(() =>
      planAlibiDailies(
        alibiCatalog,
        [
          {
            challengeDate: "2026-11-04",
            challengeNumber: 127,
            caseId: null,
            fingerprint: null,
            complete: false,
          },
        ],
        "2026-11-04",
        1,
      ),
    ).toThrow("Repair it explicitly");
  });
  it("continues numbering from existing calendar and preserves legacy assignment", () => {
    const legacy = {
      challengeDate: "2026-11-04",
      challengeNumber: 900,
      caseId: null,
      fingerprint: "legacy-content",
      complete: true,
    };
    const plan = planAlibiDailies(alibiCatalog, [legacy], "2026-11-04", 2);
    expect(plan).toHaveLength(1);
    expect(plan[0].challengeNumber).toBe(901);
  });
  it("reports real coverage gaps rather than counting disjoint future rows", () => {
    const { rows } = memoryStore();
    const plan = planAlibiDailies(alibiCatalog, [], "2026-11-04", 3);
    rows.push(
      ...plan
        .filter((_, i) => i !== 1)
        .map((p) => ({
          challengeDate: p.challengeDate,
          challengeNumber: p.challengeNumber,
          caseId: p.entry.caseId,
          fingerprint: p.fingerprint,
          complete: true,
        })),
    );
    expect(alibiCoverage(alibiCatalog, rows, "2026-11-04")).toMatchObject({
      todayPrepared: true,
      upcomingPreparedDays: 0,
      nextMissingDate: "2026-11-05",
      unusedCuratedCases: 28,
    });
  });
  it("uses calendar arithmetic through both DST boundaries and New York midnight", () => {
    expect(addCalendarDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addCalendarDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(getGameDate(new Date("2026-11-04T04:59:59Z"))).toBe("2026-11-03");
    expect(getGameDate(new Date("2026-11-04T05:00:00Z"))).toBe("2026-11-04");
    expect(() => addCalendarDays("2026-02-30", 1)).toThrow("Invalid calendar");
  });
  it("fails safely with no credentials", () => {
    expect(() => requireAlibiDatabaseUrl("")).toThrow(
      "DATABASE_URL is required.",
    );
  });
});
