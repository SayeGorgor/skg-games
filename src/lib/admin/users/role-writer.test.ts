import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const query = vi.fn();
vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn(() => ({ query })) }));
import { writeApplicationRole } from "./role-writer";
const input = {
  actorId: "00000000-0000-4000-8000-000000000001",
  targetId: "00000000-0000-4000-8000-000000000002",
  requestedRole: "analyst" as const,
  expectedRole: null,
  expectedRevision: null,
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function configure() {
  vi.stubEnv("SKG_RBAC_WRITER_APPROVED_BRANCH", "yes");
  vi.stubEnv(
    "SKG_RBAC_WRITER_DATABASE_URL",
    "postgresql://skg_role_writer:secret@writer.example/db?sslmode=require",
  );
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://skg_app:secret@runtime.example/db?sslmode=require",
  );
  vi.stubEnv("SKG_RBAC_WRITER_EXPECTED_HOST", "writer.example");
  vi.stubEnv("SKG_RBAC_RUNTIME_EXPECTED_HOST", "runtime.example");
  vi.stubEnv("SKG_RBAC_EXPECTED_DATABASE", "db");
}
it("fails closed without attestation or when endpoints mismatch", async () => {
  vi.stubEnv("SKG_RBAC_WRITER_APPROVED_BRANCH", "");
  expect(await writeApplicationRole(input)).toBe("temporarily_unavailable");
  configure();
  vi.stubEnv("SKG_RBAC_WRITER_EXPECTED_HOST", "wrong.example");
  expect(await writeApplicationRole(input)).toBe("temporarily_unavailable");
  expect(query).not.toHaveBeenCalled();
});
it("uses one parameterized invocation and does not retry an ambiguous failure", async () => {
  configure();
  query.mockRejectedValue(new Error("private"));
  expect(await writeApplicationRole(input)).toBe("temporarily_unavailable");
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][1]).toEqual([
    input.actorId,
    input.targetId,
    "analyst",
    null,
    null,
  ]);
});
