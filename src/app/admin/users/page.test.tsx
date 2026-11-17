import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/users/role-management", () => ({
  getRoleManagementActor: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/auth/authorization", () => ({
  requirePermission: vi.fn(),
  getCurrentUserRole: vi.fn(),
}));
vi.mock("@/lib/admin/users/queries", () => ({ readUserDirectory: vi.fn() }));
vi.mock("./actions", () => ({ searchUsers: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  unstable_rethrow: (error: Error) => {
    if (error.message === "NOT_FOUND") throw error;
  },
}));
import {
  requirePermission,
  getCurrentUserRole,
} from "@/lib/auth/authorization";
import { readUserDirectory } from "@/lib/admin/users/queries";
import Page, { dynamic, revalidate, fetchCache, metadata } from "./page";
import UsersLayout from "./layout";
import AdminLayout from "../layout";
beforeEach(() => vi.resetAllMocks());
it("authorizes page and feature layout before obtaining directory data", async () => {
  vi.mocked(requirePermission).mockRejectedValue(new Error("NOT_FOUND"));
  await expect(Page()).rejects.toThrow("NOT_FOUND");
  await expect(UsersLayout({ children: "private accounts" })).rejects.toThrow(
    "NOT_FOUND",
  );
  expect(readUserDirectory).not.toHaveBeenCalled();
  expect(requirePermission).toHaveBeenCalledWith("users:read");
});
it("guards the shared shell and only shows user management to Owner/Admin", async () => {
  for (const role of ["owner", "admin", "analyst", "player"] as const) {
    vi.mocked(getCurrentUserRole).mockResolvedValue(role);
    if (role === "player") {
      await expect(AdminLayout({ children: "" })).rejects.toThrow("NOT_FOUND");
      continue;
    }
    const html = renderToStaticMarkup(await AdminLayout({ children: "" }));
    expect(html).toContain("/admin/analytics");
    expect(html.includes("/admin/users")).toBe(role !== "analyst");
  }
});
it("returns a safe error state without leaking database details", async () => {
  vi.mocked(readUserDirectory).mockRejectedValue(
    new Error("postgres://password@example private record"),
  );
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain("temporarily unavailable");
  expect(html).not.toMatch(/postgres:|password@example|private record/);
});
it("preserves generic not-found from a revoked data-layer check", async () => {
  vi.mocked(readUserDirectory).mockRejectedValue(new Error("NOT_FOUND"));
  await expect(Page()).rejects.toThrow("NOT_FOUND");
});
it("disables indexing and persistent caching without personal metadata", () => {
  expect(dynamic).toBe("force-dynamic");
  expect(revalidate).toBe(0);
  expect(fetchCache).toBe("force-no-store");
  expect(metadata).toMatchObject({
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  });
});
