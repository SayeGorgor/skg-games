import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/viewer", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/auth/authorization", () => ({ getRoleForUser: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn() }));
import { getViewer } from "@/lib/auth/viewer";
import { getRoleForUser } from "@/lib/auth/authorization";
import { neon } from "@neondatabase/serverless";
import AuditRoute from "@/app/admin/audit/page";
import AuditLayout from "@/app/admin/audit/layout";
import { searchAuditHistory } from "@/app/admin/audit/actions";
import { auditHistoryEnabled } from "./feature";
import { parseAuditInput } from "./filters";
import { readAuditHistory } from "./reader";

const actor = "00000000-0000-4000-8000-000000000001";
const time = "2026-11-18T12:30:00.123456Z";
const now = new Date(time);
const query = vi.fn();
const form = (...entries: [string, string][]) => {
  const input = new FormData();
  for (const [name, value] of entries) input.append(name, value);
  return input;
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("SKG_AUDIT_HISTORY_ENABLED", "yes");
  vi.stubEnv("SKG_AUDIT_HISTORY_PRODUCTION_APPROVED", "");
  vi.stubEnv("SKG_AUDIT_READER_APPROVED_BRANCH", "yes");
  vi.stubEnv(
    "SKG_AUDIT_READER_DATABASE_URL",
    "postgresql://skg_audit_reader:test@reader.example/db?sslmode=require",
  );
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://skg_app:test@runtime.example/db?sslmode=require",
  );
  vi.stubEnv("SKG_AUDIT_READER_EXPECTED_HOST", "reader.example");
  vi.stubEnv("SKG_AUDIT_RUNTIME_EXPECTED_HOST", "runtime.example");
  vi.stubEnv("SKG_AUDIT_EXPECTED_DATABASE", "db");
  vi.mocked(getViewer).mockResolvedValue({
    authenticated: true,
    userId: actor,
    email: null,
    name: null,
    premium: false,
  });
  vi.mocked(getRoleForUser).mockResolvedValue("owner");
  vi.mocked(neon).mockReturnValue({ query } as unknown as ReturnType<
    typeof neon
  >);
  query.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

it.each(["admin", "analyst", "player"] as const)(
  "blocks direct action and query for %s",
  async (role) => {
    vi.mocked(getRoleForUser).mockResolvedValue(role);
    await expect(searchAuditHistory(form())).rejects.toThrow("NOT_FOUND");
    await expect(readAuditHistory()).rejects.toThrow("NOT_FOUND");
    await expect(AuditRoute()).rejects.toThrow("NOT_FOUND");
    await expect(AuditLayout({ children: null })).rejects.toThrow("NOT_FOUND");
    expect(neon).not.toHaveBeenCalled();
  },
);

it("uses current Owner authority, rejects forged inputs and loses access on demotion", async () => {
  expect(await searchAuditHistory(form())).toEqual({
    status: "ready",
    page: { events: [], nextCursor: null },
  });
  expect(getViewer).toHaveBeenCalledWith(true);
  expect(getRoleForUser).toHaveBeenCalledWith(actor);
  expect(
    await searchAuditHistory(
      form(["actorRole", "owner"], ["permission", "audit:read"]),
    ),
  ).toEqual({ status: "invalid_filters" });
  vi.mocked(getRoleForUser).mockResolvedValue("player");
  await expect(searchAuditHistory(form())).rejects.toThrow("NOT_FOUND");
  vi.mocked(getViewer).mockResolvedValue({
    authenticated: false,
    userId: null,
    email: null,
    name: null,
    premium: false,
  });
  await expect(readAuditHistory()).rejects.toThrow("NOT_FOUND");
  expect(query).toHaveBeenCalledTimes(1);
});

it("fails closed when disabled or unconfigured and requires separate production approval", async () => {
  vi.stubEnv("NODE_ENV", "production");
  expect(auditHistoryEnabled()).toBe(false);
  expect(await searchAuditHistory(form())).toEqual({ status: "disabled" });
  vi.stubEnv("VERCEL_ENV", "preview");
  expect(auditHistoryEnabled()).toBe(true);
  vi.stubEnv("SKG_AUDIT_READER_DATABASE_URL", "");
  expect(await searchAuditHistory(form())).toEqual({ status: "unconfigured" });
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("SKG_AUDIT_HISTORY_PRODUCTION_APPROVED", "yes");
  expect(auditHistoryEnabled()).toBe(true);
  expect(neon).not.toHaveBeenCalled();
});

it("returns a minimal DTO, uses parameters and redacts internal failures", async () => {
  query.mockResolvedValueOnce([
    {
      id: actor,
      action: "owner_bootstrap",
      actor_type: "system_bootstrap",
      actor_user_id: null,
      target_user_id: "legacy-private-value",
      previous_role: null,
      new_role: "owner",
      created_at: time,
      operator_reference: "private",
    },
  ]);
  const result = await readAuditHistory(form(["target", actor]));
  expect(result).toEqual({
    status: "ready",
    page: {
      nextCursor: null,
      events: [
        {
          id: actor,
          action: "owner_bootstrap",
          actorType: "system_bootstrap",
          actorId: null,
          targetId: null,
          previousRole: null,
          newRole: "owner",
          createdAt: time,
        },
      ],
    },
  });
  expect(query.mock.calls[0][0]).not.toContain(actor);
  expect(query.mock.calls[0][1][2]).toBe(actor);
  query.mockRejectedValueOnce(new Error("private SQL"));
  expect(await readAuditHistory()).toEqual({ status: "unavailable" });
});

it("validates UTC ranges, filter-bound cursors and preserves the preset anchor", () => {
  expect(() => parseAuditInput(form(["actor", "' OR true"]))).toThrow(
    "invalid_filters",
  );
  expect(() =>
    parseAuditInput(
      form(
        ["period", "custom"],
        ["start", "2026-02-30"],
        ["end", "2026-03-01"],
      ),
    ),
  ).toThrow("invalid_filters");
  expect(() =>
    parseAuditInput(
      form(
        ["period", "custom"],
        ["start", "2026-10-01"],
        ["end", "2026-09-01"],
      ),
    ),
  ).toThrow("invalid_filters");
  expect(() => parseAuditInput(form(["cursor", "invalid"]))).toThrow(
    "invalid_cursor",
  );
  const input = parseAuditInput(form(["period", "7"], ["target", actor]), now);
  const cursor = input.cursorFor(time, actor);
  expect(() => parseAuditInput(form(["cursor", cursor]), now)).toThrow(
    "invalid_cursor",
  );
  const next = parseAuditInput(
    form(["period", "7"], ["target", actor], ["cursor", cursor]),
    new Date("2026-11-19T00:00:00Z"),
  );
  expect(next.parameters.slice(3, 5)).toEqual([
    "2026-11-12T00:00:00.000Z",
    "2026-11-19T00:00:00.000Z",
  ]);
  expect(next.parameters[7]).toBe(time);
});
