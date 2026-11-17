import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/viewer", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/auth/authorization", () => ({
  getRoleForUser: vi.fn(),
  requirePermission: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => {
    throw new Error("Unexpected database operation");
  }),
}));
import { getViewer } from "@/lib/auth/viewer";
import { getRoleForUser, requirePermission } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { changeUserRole } from "./role-management";
import { requestRoleChange } from "@/app/admin/users/role-actions";
const actor = "00000000-0000-4000-8000-000000000001";
const target = "00000000-0000-4000-8000-000000000002";
const input = {
  targetId: target,
  requestedRole: "analyst",
  expectedRole: "player",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getViewer).mockResolvedValue({
    userId: actor,
    authenticated: true,
    email: null,
    name: null,
    premium: false,
  });
  vi.mocked(getRoleForUser).mockResolvedValue("owner");
  vi.mocked(requirePermission).mockResolvedValue();
});
it("independently rechecks trusted identity/role and stays closed for every valid transition", async () => {
  for (const actorRole of ["owner", "admin"] as const) {
    vi.mocked(getRoleForUser).mockResolvedValue(actorRole);
    expect(await changeUserRole(input)).toEqual({
      status: "temporarily_unavailable",
    });
  }
  expect(getRoleForUser).toHaveBeenCalledWith(actor);
  expect(getDb).not.toHaveBeenCalled();
});
it("denies direct calls, missing sessions, downgraded actors and privilege lookup failures", async () => {
  for (const role of ["player", "analyst"] as const) {
    vi.mocked(getRoleForUser).mockResolvedValue(role);
    expect(await changeUserRole(input)).toEqual({ status: "forbidden" });
  }
  vi.mocked(getViewer).mockResolvedValue({
    userId: null,
    authenticated: false,
    email: "owner@example.test",
    name: null,
    premium: true,
  });
  expect(await changeUserRole(input)).toEqual({ status: "forbidden" });
  vi.mocked(getViewer).mockRejectedValue(new Error("private session token"));
  expect(await changeUserRole(input)).toEqual({ status: "forbidden" });
  expect(getDb).not.toHaveBeenCalled();
});
it("rejects forged actor fields, malformed IDs, Owner, self, no-op and protected Admin transitions", async () => {
  for (const forged of [
    null,
    [],
    {},
    { ...input, actorId: actor },
    { ...input, actorRole: "owner" },
    { ...input, permissions: ["system:manage"] },
    { ...input, targetId: "not-an-id" },
    { ...input, requestedRole: "owner" },
    { ...input, expectedRole: "owner" },
    { ...input, targetId: actor },
    { ...input, requestedRole: "player" },
  ])
    expect(await changeUserRole(forged)).toEqual({ status: "forbidden" });
  vi.mocked(getRoleForUser).mockResolvedValue("admin");
  for (const protectedInput of [
    { ...input, expectedRole: "admin" },
    { ...input, requestedRole: "admin" },
  ])
    expect(await changeUserRole(protectedInput)).toEqual({
      status: "forbidden",
    });
  expect(getDb).not.toHaveBeenCalled();
});
it("protects the action before the independent boundary and does not leak details", async () => {
  vi.mocked(requirePermission).mockRejectedValue(new Error("NOT_FOUND"));
  await expect(requestRoleChange(input)).rejects.toThrow("NOT_FOUND");
  expect(getViewer).not.toHaveBeenCalled();
  expect(requirePermission).toHaveBeenCalledWith("users:manage");
});
it("repeated/concurrent submissions never write roles or audits or report success", async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, () => requestRoleChange(input)),
  );
  expect(results.every((r) => r.status === "temporarily_unavailable")).toBe(
    true,
  );
  expect(getDb).not.toHaveBeenCalled();
});
