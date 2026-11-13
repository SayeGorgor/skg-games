import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalyticsDashboard } from "./dashboard";
import type { AnalyticsData } from "@/lib/analytics/queries";
import { reportingWindow, type ReportingDays } from "@/lib/analytics/window";
import { writeFileSync, readFileSync } from "node:fs";
vi.mock("./dashboard.module.css", () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}));
function fixture(results = 0, days: ReportingDays = 90): AnalyticsData {
  const window = reportingWindow(days, new Date("2026-11-12T17:00:00Z"));
  return {
    window,
    overview: { results, solves: results, accounts: results ? 1 : 0 },
    trend: window.dates.map((date, i) => ({
      date,
      results: results ? i % 5 : 0,
    })),
    games: [
      {
        key: "perfect-stack",
        label: "Perfect Stack",
        results,
        solves: results,
      },
      { key: "daily-alibi", label: "Daily Alibi", results: 0, solves: 0 },
    ],
    modes: [
      { key: "daily", label: "Daily", results },
      { key: "practice", label: "Practice", results: 0 },
    ],
    difficulties: ["small", "medium", "hard", "default"].map((key) => ({
      key,
      label: key === "default" ? "Unspecified legacy" : key,
      results: key === "small" ? results : 0,
      averageMoves: results && key === "small" ? 8 : null,
      averageDurationMs: results && key === "small" ? 1000 : null,
    })),
    alibiSolveRate: null,
  };
}
it("renders honest empty states, zero values, and accessible chart alternatives", () => {
  const html = renderToStaticMarkup(<AnalyticsDashboard data={fixture()} />);
  expect(html).toContain("No verified, dated canonical results");
  expect(html).toContain("No accusations yet");
  expect(html).toContain("Daily values and chart alternative");
  expect(html).toContain('scope="col"');
  expect(html).not.toMatch(/NaN|Infinity|undefined/);
});
it("renders measured values without identifiers and supports a local fixture preview", () => {
  const html = renderToStaticMarkup(<AnalyticsDashboard data={fixture(180)} />);
  expect(html).toContain("8.0");
  expect(html).toContain("1.0 s");
  expect(html).toContain("Active recorded accounts");
  expect(html).not.toMatch(/user_id|anonymous_id|puzzle_seed/);
  if (process.env.SKG_LOCAL_ANALYTICS_PREVIEW === "1") {
    const css = readFileSync(
      "src/components/analytics/dashboard.module.css",
      "utf8",
    );
    const global = readFileSync("src/app/globals.css", "utf8").replace(
      /^@import.*$/gm,
      "",
    );
    for (const days of [7, 30, 90] as const) {
      const total = Array.from({ length: days }, (_, i) => i % 5).reduce(
        (sum, value) => sum + value,
        0,
      );
      const preview = renderToStaticMarkup(
        <AnalyticsDashboard data={fixture(total, days)} />,
      );
      const document = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${global}\n${css}</style><body><main class="container page"><h1>Analytics test fixture - ${days} days - local preview only</h1>${preview}</main></body></html>`;
      writeFileSync(`developer-docs/analytics-preview-${days}.html`, document);
      if (days === 90)
        writeFileSync("developer-docs/analytics-preview.html", document);
    }
  }
});

it.each([7, 30, 90] as const)(
  "renders the correct bar granularity and original daily table for %s days",
  (days) => {
    const html = renderToStaticMarkup(
      <AnalyticsDashboard data={fixture(0, days)} />,
    );
    expect(html).toContain(`data-period="${days === 90 ? "weekly" : "daily"}"`);
    expect((html.match(/class="column"/g) ?? []).length).toBe(
      days === 90 ? 14 : days,
    );
    expect(html).toContain("Verified results per New York calendar day");
    expect(html).toContain("Completion dates can be client-reported");
    if (days === 90) expect(html).toContain("Monday-Sunday calendar weeks");
  },
);
it("uses native collapsed definitions while preserving all five limitations", () => {
  const html = renderToStaticMarkup(<AnalyticsDashboard data={fixture()} />);
  expect(html).toMatch(
    /<details class="metricDetails"><summary>How these metrics are calculated<\/summary>/,
  );
  for (const phrase of [
    "Deduplication happens across history",
    "Completion dates can be client-reported",
    "Active recorded accounts are distinct",
    "Only persisted activity is visible",
    "Practice counts distinct persisted",
  ])
    expect(html).toContain(phrase);
  expect(html).toContain('aria-describedby="stack-scroll-hint"');
  expect(html).toContain('tabindex="0"');
});
