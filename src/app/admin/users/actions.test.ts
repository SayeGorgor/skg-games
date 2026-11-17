import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/authorization", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/admin/users/queries", () => ({ readUserDirectory: vi.fn() }));
vi.mock("next/navigation", () => ({
  unstable_rethrow: (e: Error) => {
    if (e.message === "NOT_FOUND") throw e;
  },
}));
import { requirePermission } from "@/lib/auth/authorization";
import { readUserDirectory } from "@/lib/admin/users/queries";
import { DirectoryInputError } from "@/lib/admin/users/filters";
import { searchUsers } from "./actions";
beforeEach(() => vi.resetAllMocks());
it("authenticates every POST action before parsing or querying", async () => {
  vi.mocked(requirePermission).mockRejectedValue(new Error("NOT_FOUND"));
  await expect(searchUsers(new FormData())).rejects.toThrow("NOT_FOUND");
  expect(readUserDirectory).not.toHaveBeenCalled();
});
it("forwards only validated query controls, never a caller identity or prior directory state", async () => {
  const form = new FormData();
  form.set("search", "person@example.test");
  form.set("role", "player");
  form.set("pageSize", "25");
  form.set("page", "next:cursor");
  await searchUsers(form);
  expect(requirePermission).toHaveBeenCalledWith("users:read");
  expect(readUserDirectory).toHaveBeenCalledExactlyOnceWith({
    search: "person@example.test",
    role: "player",
    pageSize: "25",
    cursor: "cursor",
    direction: "next",
  });
});
it("rejects duplicate controls and unsolicited identity fields", async () => {
  const duplicate = new FormData();
  duplicate.append("search", "one");
  duplicate.append("search", "two");
  expect((await searchUsers(duplicate)).status).toBe("invalid");
  const spoof = new FormData();
  spoof.set("userId", "someone-else");
  expect((await searchUsers(spoof)).status).toBe("invalid");
  expect(readUserDirectory).not.toHaveBeenCalled();
});
it("safely classifies validation and database errors without reflecting records or search", async () => {
  vi.mocked(readUserDirectory)
    .mockRejectedValueOnce(new DirectoryInputError())
    .mockRejectedValueOnce(new Error("email@example.test raw SQL password"));
  expect((await searchUsers(new FormData())).status).toBe("invalid");
  const result = await searchUsers(new FormData());
  expect(result).toMatchObject({ status: "error", result: null });
  expect(JSON.stringify(result)).not.toMatch(/email@example|raw SQL|password/);
});
