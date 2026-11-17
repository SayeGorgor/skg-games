import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/viewer", () => ({
  getViewer: vi.fn(async () => ({
    authenticated: true,
    userId: "00000000-0000-4000-8000-000000000001",
  })),
}));
vi.mock("@/lib/auth/authorization", () => ({
  getRoleForUser: vi.fn(async () => "owner"),
}));
vi.mock("./role-writer", () => ({
  writeApplicationRole: vi.fn(async () => "success"),
}));
import { changeUserRole } from "./role-management";
import { writeApplicationRole } from "./role-writer";
const input = {
  targetId: "00000000-0000-4000-8000-000000000002",
  requestedRole: "analyst",
  expectedRole: null,
  expectedRevision: null,
};
it("derives actor authority from the session and rejects forged actor fields", async () => {
  expect(await changeUserRole({ ...input, actorId: input.targetId })).toEqual({
    status: "forbidden",
  });
  expect(await changeUserRole({ ...input, actorRole: "owner" })).toEqual({
    status: "forbidden",
  });
  expect(writeApplicationRole).not.toHaveBeenCalled();
  expect(await changeUserRole(input)).toEqual({ status: "success" });
  expect(writeApplicationRole).toHaveBeenCalledWith({
    ...input,
    actorId: "00000000-0000-4000-8000-000000000001",
  });
});
