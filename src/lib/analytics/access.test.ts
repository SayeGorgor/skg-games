import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/auth/viewer", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/auth/authorization", () => ({ getRoleForUser: vi.fn() }));
import { getRoleForUser } from "@/lib/auth/authorization";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import type { AppRole } from "@/lib/auth/permissions";
import { requireAnalyticsAdmin } from "./access";
const viewer = { userId: "trusted-user", authenticated: true } as Viewer;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SKG_ANALYTICS_ADMIN_USER_IDS", undefined);
  vi.mocked(getViewer).mockResolvedValue(viewer);
  vi.mocked(getRoleForUser).mockResolvedValue("player");
});
afterEach(() => vi.unstubAllEnvs());
it.each(["owner", "admin", "analyst"] as const)(
  "allows database-backed %s with no legacy configuration",
  async (role) => {
    vi.mocked(getRoleForUser).mockResolvedValue(role);
    expect(await requireAnalyticsAdmin()).toBeUndefined();
    expect(getRoleForUser).toHaveBeenCalledExactlyOnceWith(viewer.userId);
  },
);
it.each([undefined, "", "trusted-user", " another-user, trusted-user "])(
  "never lets retired configuration %s authorize a Player",
  async (value) => {
    vi.stubEnv("SKG_ANALYTICS_ADMIN_USER_IDS", value);
    await expect(requireAnalyticsAdmin()).rejects.toThrow(/^NOT_FOUND$/);
  },
);
it.each([null, "superadmin", "__proto__", "Owner"])(
  "rejects invalid runtime role %s",
  async (role) => {
    vi.mocked(getRoleForUser).mockResolvedValue(role as AppRole);
    await expect(requireAnalyticsAdmin()).rejects.toThrow(/^NOT_FOUND$/);
  },
);
it.each([
  { userId: null, authenticated: false },
  { userId: "trusted-user", authenticated: false },
  { userId: null, authenticated: true },
])(
  "denies absent/unauthenticated identity before role lookup",
  async (identity) => {
    vi.stubEnv("SKG_ANALYTICS_ADMIN_USER_IDS", "trusted-user");
    vi.mocked(getViewer).mockResolvedValue(identity as Viewer);
    vi.mocked(getRoleForUser).mockResolvedValue("owner");
    await expect(requireAnalyticsAdmin()).rejects.toThrow(/^NOT_FOUND$/);
    expect(getRoleForUser).not.toHaveBeenCalled();
  },
);
it("ignores profile, subscription and client-like claims", async () => {
  vi.mocked(getViewer).mockResolvedValue({
    ...viewer,
    email: "owner@example.test",
    name: "Owner",
    premium: true,
    role: "owner",
    requestedUserId: "some-owner",
  } as Viewer);
  await expect(requireAnalyticsAdmin()).rejects.toThrow(/^NOT_FOUND$/);
  expect(getRoleForUser).toHaveBeenCalledWith(viewer.userId);
});
it("conceals session and role lookup errors even when a stale variable lists the caller", async () => {
  vi.stubEnv("SKG_ANALYTICS_ADMIN_USER_IDS", viewer.userId!);
  vi.mocked(getRoleForUser).mockRejectedValue(
    new Error("private database credentials"),
  );
  await expect(requireAnalyticsAdmin()).rejects.toThrow(/^NOT_FOUND$/);
  vi.mocked(getViewer).mockRejectedValue(new Error("private session details"));
  await expect(requireAnalyticsAdmin()).rejects.toThrow(/^NOT_FOUND$/);
});
it("rechecks permission after a downgrade without a new login", async () => {
  vi.mocked(getRoleForUser)
    .mockResolvedValueOnce("owner")
    .mockResolvedValueOnce("player");
  expect(await requireAnalyticsAdmin()).toBeUndefined();
  await expect(requireAnalyticsAdmin()).rejects.toThrow(/^NOT_FOUND$/);
  expect(getRoleForUser).toHaveBeenCalledTimes(2);
});
