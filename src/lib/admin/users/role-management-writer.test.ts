import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
  isRoleWriterConfigured: vi.fn(() => true),
  writeApplicationRole: vi.fn(async () => "success"),
}));
import { changeUserRole } from "./role-management";
import { requestRoleChange } from "@/app/admin/users/role-actions";
import { getViewer } from "@/lib/auth/viewer";
import { getRoleForUser } from "@/lib/auth/authorization";
import { isRoleWriterConfigured, writeApplicationRole } from "./role-writer";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("SKG_RBAC_ROLE_MANAGEMENT_ENABLED", "yes");
  vi.stubEnv("SKG_RBAC_ROLE_MANAGEMENT_PRODUCTION_APPROVED", "");
});
afterEach(() => vi.unstubAllEnvs());
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

it("gates the action with writer configuration and separate production approval", async () => {
  vi.mocked(isRoleWriterConfigured).mockReturnValueOnce(false);
  expect(await requestRoleChange(input)).toEqual({
    status: "temporarily_unavailable",
  });
  vi.stubEnv("VERCEL_ENV", "production");
  expect(await requestRoleChange(input)).toEqual({
    status: "temporarily_unavailable",
  });
  expect(getViewer).not.toHaveBeenCalled();
  expect(writeApplicationRole).not.toHaveBeenCalled();
  vi.stubEnv("SKG_RBAC_ROLE_MANAGEMENT_PRODUCTION_APPROVED", "yes");
  expect(await requestRoleChange(input)).toEqual({ status: "success" });
  expect(getViewer).toHaveBeenCalledExactlyOnceWith(true);
  expect(writeApplicationRole).toHaveBeenCalledTimes(1);
});

it("requires a session and reevaluates the role for a reused actor", async () => {
  vi.mocked(getViewer).mockResolvedValueOnce({
    authenticated: false,
    userId: null,
    email: null,
    name: null,
    premium: false,
  });
  expect(await requestRoleChange(input)).toEqual({ status: "forbidden" });
  vi.mocked(getRoleForUser)
    .mockResolvedValueOnce("admin")
    .mockResolvedValueOnce("player");
  expect(await requestRoleChange(input)).toEqual({ status: "success" });
  expect(await requestRoleChange(input)).toEqual({ status: "forbidden" });
  expect(writeApplicationRole).toHaveBeenCalledTimes(1);
});

it("passes an explicit bigint precondition intact, including a possible writer no-op", async () => {
  const expectedRevision = "9007199254740993";
  vi.mocked(writeApplicationRole).mockResolvedValueOnce("no_change");
  expect(
    await requestRoleChange({
      ...input,
      requestedRole: "player",
      expectedRole: "player",
      expectedRevision,
    }),
  ).toEqual({ status: "no_change" });
  expect(writeApplicationRole).toHaveBeenCalledWith(
    expect.objectContaining({ expectedRevision }),
  );
  expect(
    await requestRoleChange({
      ...input,
      expectedRole: "player",
      expectedRevision: Number(expectedRevision),
    }),
  ).toEqual({ status: "forbidden" });
  expect(writeApplicationRole).toHaveBeenCalledTimes(1);
});

it("requires production approval for a production process outside Vercel Preview", async () => {
  vi.stubEnv("NODE_ENV", "production");
  expect(await requestRoleChange(input)).toEqual({
    status: "temporarily_unavailable",
  });
  expect(writeApplicationRole).not.toHaveBeenCalled();
  vi.stubEnv("VERCEL_ENV", "preview");
  expect(await requestRoleChange(input)).toEqual({ status: "success" });
  expect(writeApplicationRole).toHaveBeenCalledTimes(1);
});
