import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  unstable_rethrow: (error: Error) => {
    if (error.message === "NOT_FOUND") throw error;
  },
}));
vi.mock("@/lib/analytics/access", () => ({ requireAnalyticsAdmin: vi.fn() }));
vi.mock("@/lib/analytics/queries", () => ({ readAnalytics: vi.fn() }));
import { requireAnalyticsAdmin } from "@/lib/analytics/access";
import { readAnalytics } from "@/lib/analytics/queries";
import AdminLayout from "../layout";
import AnalyticsPage, {
  dynamic,
  revalidate,
  fetchCache,
  metadata,
} from "./page";
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());
it("refuses the page before querying or rendering analytics", async () => {
  vi.mocked(requireAnalyticsAdmin).mockRejectedValue(new Error("NOT_FOUND"));
  await expect(
    AnalyticsPage({ searchParams: Promise.resolve({ days: "7" }) }),
  ).rejects.toThrow("NOT_FOUND");
  expect(readAnalytics).not.toHaveBeenCalled();
});
it("shows only a safe error state and does not leak DB failures", async () => {
  vi.mocked(readAnalytics).mockRejectedValue(
    new Error("postgres://secret:user@host private-user raw SQL"),
  );
  const html = renderToStaticMarkup(
    await AnalyticsPage({ searchParams: Promise.resolve({ days: "7" }) }),
  );
  expect(html).toContain("Analytics temporarily unavailable");
  expect(html).not.toMatch(/postgres:|private-user|raw SQL|secret/);
});
it("validates unknown query keys without querying", async () => {
  const html = renderToStaticMarkup(
    await AnalyticsPage({
      searchParams: Promise.resolve({ arbitrary: "private-value" }),
    }),
  );
  expect(html).toContain("Invalid reporting window");
  expect(html).not.toContain("private-value");
  expect(readAnalytics).not.toHaveBeenCalled();
});
it("preserves framework access errors", async () => {
  vi.mocked(readAnalytics).mockRejectedValue(new Error("NOT_FOUND"));
  await expect(
    AnalyticsPage({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow("NOT_FOUND");
});
it("disables static caching and indexing", () => {
  expect(dynamic).toBe("force-dynamic");
  expect(revalidate).toBe(0);
  expect(fetchCache).toBe("force-no-store");
  expect(metadata.robots).toMatchObject({
    index: false,
    follow: false,
    nocache: true,
  });
});

it("guards the admin layout above the loading boundary", async () => {
  vi.mocked(requireAnalyticsAdmin).mockRejectedValueOnce(
    new Error("NOT_FOUND"),
  );
  await expect(
    AdminLayout({ children: "private analytics content" }),
  ).rejects.toThrow("NOT_FOUND");
  vi.mocked(requireAnalyticsAdmin).mockResolvedValueOnce(undefined);
  expect(await AdminLayout({ children: "authorized content" })).toBe(
    "authorized content",
  );
});
