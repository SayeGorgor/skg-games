import { expect, it } from "vitest";
import { activityBars } from "./activity";
import { reportingWindow } from "@/lib/analytics/window";

it.each([7, 30] as const)("keeps all %s daily values unchanged", (days) => {
  const trend = reportingWindow(
    days,
    new Date("2026-11-12T17:00:00Z"),
  ).dates.map((date, i) => ({ date, results: i }));
  const before = structuredClone(trend);
  const bars = activityBars(trend, false);
  expect(bars).toHaveLength(days);
  expect(
    bars.map((bar) => ({ date: bar.startDate, results: bar.results })),
  ).toEqual(trend);
  expect(trend).toEqual(before);
});
it("uses Monday-Sunday calendar boundaries and preserves partial weeks", () => {
  const trend = [
    { date: "2026-11-01", results: 2 }, // Sunday, fall DST transition
    { date: "2026-11-02", results: 3 }, // Monday, new week
    { date: "2026-11-08", results: 5 }, // Sunday, same week
    { date: "2026-11-09", results: 7 },
  ];
  expect(activityBars(trend, true)).toEqual([
    {
      weekStart: "2026-10-26",
      startDate: "2026-11-01",
      endDate: "2026-11-01",
      results: 2,
    },
    {
      weekStart: "2026-11-02",
      startDate: "2026-11-02",
      endDate: "2026-11-08",
      results: 8,
    },
    {
      weekStart: "2026-11-09",
      startDate: "2026-11-09",
      endDate: "2026-11-09",
      results: 7,
    },
  ]);
});
it.each([
  "2026-03-10T17:00:00Z",
  "2026-11-12T17:00:00Z",
  "2027-01-04T17:00:00Z",
  "2024-03-04T17:00:00Z",
])(
  "preserves 90-day totals across DST, leap dates and year changes: %s",
  (now) => {
    const trend = reportingWindow(90, new Date(now)).dates.map((date, i) => ({
      date,
      results: i % 5,
    }));
    const before = structuredClone(trend);
    const bars = activityBars(trend, true);
    expect(bars.length).toBeGreaterThanOrEqual(13);
    expect(bars.length).toBeLessThanOrEqual(14);
    expect(bars.reduce((sum, bar) => sum + bar.results, 0)).toBe(
      trend.reduce((sum, day) => sum + day.results, 0),
    );
    expect(bars[0].startDate).toBe(trend[0].date);
    expect(bars.at(-1)!.endDate).toBe(trend.at(-1)!.date);
    expect(
      bars.every(
        (bar) => new Date(`${bar.weekStart}T00:00:00Z`).getUTCDay() === 1,
      ),
    ).toBe(true);
    expect(trend).toEqual(before);
  },
);
it("retains zero-activity weeks and handles empty input", () => {
  expect(activityBars([], true)).toEqual([]);
  expect(
    activityBars([{ date: "2026-11-09", results: 0 }], true)[0].results,
  ).toBe(0);
});
