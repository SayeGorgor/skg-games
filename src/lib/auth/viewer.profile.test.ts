import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("./server", () => ({ auth: { getSession: vi.fn() } }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  metrics: { count: vi.fn(), distribution: vi.fn(), gauge: vi.fn() },
  captureException: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
  setContext: vi.fn(),
}));
import * as Sentry from "@sentry/nextjs";
import { auth } from "./server";
import { getDb } from "@/lib/db";
import { ensureProfileForAuthUser, getViewer } from "./viewer";
const pg = new PGlite();
const db = drizzle(pg);
const user = {
  id: "trusted-user",
  name: "Session Name",
  email: "trusted@example.test",
};
let migratedProfile: Record<string, unknown>;
beforeAll(async () => {
  for (const file of readdirSync("drizzle")
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort()) {
    if (file === "0005_user_profile_email.sql")
      await pg.exec(
        "INSERT INTO user_profiles(user_id,display_name) VALUES ('legacy-before-migration','Legacy Name')",
      );
    await pg.exec(
      readFileSync(path.join("drizzle", file), "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
  }
  migratedProfile = (
    await pg.query<Record<string, unknown>>(
      "SELECT user_id,display_name,email FROM user_profiles WHERE user_id='legacy-before-migration'",
    )
  ).rows[0];
  // Detect actual UPDATEs, even ones that would set an identical timestamp/value.
  await pg.exec(`CREATE TABLE profile_update_audit (id integer GENERATED ALWAYS AS IDENTITY);
    CREATE FUNCTION track_profile_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO profile_update_audit DEFAULT VALUES; RETURN NEW; END $$;
    CREATE TRIGGER profile_update_test AFTER UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION track_profile_update();`);
}, 30000);
beforeEach(async () => {
  vi.resetAllMocks();
  vi.mocked(getDb).mockReturnValue(
    db as unknown as NonNullable<ReturnType<typeof getDb>>,
  );
  await pg.exec(
    "DELETE FROM user_profiles; DELETE FROM subscriptions; TRUNCATE profile_update_audit",
  );
});
afterEach(() => {
  const telemetry = JSON.stringify([
    ...vi.mocked(Sentry.logger.info).mock.calls,
    ...vi.mocked(Sentry.logger.warn).mock.calls,
    ...vi.mocked(Sentry.logger.error).mock.calls,
    ...vi.mocked(Sentry.metrics.count).mock.calls,
    ...vi.mocked(Sentry.metrics.distribution).mock.calls,
    ...vi.mocked(Sentry.captureException).mock.calls,
    ...vi.mocked(Sentry.setTag).mock.calls,
    ...vi.mocked(Sentry.setUser).mock.calls,
    ...vi.mocked(Sentry.setContext).mock.calls,
  ]);
  expect(telemetry).not.toContain("@example.test");
});
afterAll(async () => {
  await pg.close();
});
async function profile() {
  return (
    await pg.query<Record<string, unknown>>(
      "SELECT * FROM user_profiles WHERE user_id=$1",
      [user.id],
    )
  ).rows[0];
}
async function updates() {
  return Number(
    (
      await pg.query<{ count: number }>(
        "SELECT count(*) AS count FROM profile_update_audit",
      )
    ).rows[0].count,
  );
}
async function existing(email: string | null) {
  await pg.query(
    `INSERT INTO user_profiles(user_id,email,display_name,preferred_theme,created_at,updated_at) VALUES ($1,$2,'Custom Name','dark','2026-01-01T00:00:00Z','2026-01-02T00:00:00Z')`,
    [user.id, email],
  );
}
it("adds only nullable email while preserving existing profiles", () => {
  expect(
    readFileSync("drizzle/0005_user_profile_email.sql", "utf8").trim(),
  ).toBe('ALTER TABLE "user_profiles" ADD COLUMN "email" text;');
  expect(migratedProfile).toEqual({
    user_id: "legacy-before-migration",
    display_name: "Legacy Name",
    email: null,
  });
});
it("creates a profile from the trusted authenticated session and preserves premium entitlement", async () => {
  vi.mocked(auth!.getSession).mockResolvedValue({ data: { user } } as never);
  await pg.query(
    "INSERT INTO subscriptions(user_id,status,current_period_end) VALUES ($1,'active','2099-01-01T00:00:00Z')",
    [user.id],
  );
  expect(await getViewer()).toMatchObject({
    userId: user.id,
    email: user.email,
    authenticated: true,
    premium: true,
  });
  expect(await profile()).toMatchObject({
    user_id: user.id,
    email: user.email,
    display_name: user.name,
    preferred_theme: "system",
  });
  expect(await updates()).toBe(0);
});
it.each([null, "old@example.test"])(
  "synchronizes missing or changed email %s without replacing preferences",
  async (email) => {
    await existing(email);
    const before = await profile();
    await ensureProfileForAuthUser(user);
    expect(await profile()).toMatchObject({
      email: user.email,
      display_name: "Custom Name",
      preferred_theme: "dark",
      created_at: before.created_at,
    });
    expect((await profile()).updated_at).not.toEqual(before.updated_at);
    expect(await updates()).toBe(1);
  },
);
it("performs no UPDATE for unchanged email, including a repeat synchronization", async () => {
  await existing(user.email);
  const before = await profile();
  await ensureProfileForAuthUser(user);
  await ensureProfileForAuthUser(user);
  expect(await profile()).toEqual(before);
  expect(await updates()).toBe(0);
});
it.each([undefined, null, "", "   "])(
  "never erases existing email when session supplies %s",
  async (email) => {
    await existing(user.email);
    const before = await profile();
    await ensureProfileForAuthUser({ ...user, email });
    expect(await profile()).toEqual(before);
    expect(await updates()).toBe(0);
  },
);
it("permits a new profile without name/email and later fills email", async () => {
  await ensureProfileForAuthUser({ id: user.id });
  expect(await profile()).toMatchObject({ email: null, display_name: null });
  await ensureProfileForAuthUser(user);
  expect(await profile()).toMatchObject({
    email: user.email,
    display_name: null,
  });
});
it("does not write profiles for unauthenticated sessions", async () => {
  vi.mocked(auth!.getSession).mockResolvedValue({
    data: null,
    error: null,
  } as never);
  expect(await getViewer()).toMatchObject({
    authenticated: false,
    premium: false,
  });
  expect(getDb).not.toHaveBeenCalled();
  expect(await profile()).toBeUndefined();
});
it("preserves session identity and fail-closed premium behavior on DB failure without leaking email", async () => {
  vi.mocked(auth!.getSession).mockResolvedValue({ data: { user } } as never);
  vi.mocked(getDb).mockImplementation(() => {
    throw new Error(`SQL email ${user.email}`);
  });
  expect(await getViewer()).toMatchObject({
    userId: user.id,
    email: user.email,
    authenticated: true,
    premium: false,
  });
  expect(Sentry.logger.error).toHaveBeenCalledExactlyOnceWith(
    "Account entitlement lookup failed",
    {
      operation: "get_entitlement",
      feature: "auth",
      outcome: "unexpected_failure",
    },
  );
  expect(Sentry.captureException).not.toHaveBeenCalled();
});
it("retains supported no-database fallback", async () => {
  vi.mocked(getDb).mockReturnValue(null);
  vi.mocked(auth!.getSession).mockResolvedValue({ data: { user } } as never);
  expect(await getViewer()).toMatchObject({
    userId: user.id,
    authenticated: true,
    premium: false,
  });
  expect(Sentry.logger.error).not.toHaveBeenCalled();
});

it("allows different Auth identities to share an email without merging profiles", async () => {
  await ensureProfileForAuthUser(user);
  await ensureProfileForAuthUser({ ...user, id: "second-trusted-user" });
  const rows = await pg.query<{ count: number }>(
    "SELECT count(*) AS count FROM user_profiles WHERE email=$1",
    [user.email],
  );
  expect(Number(rows.rows[0].count)).toBe(2);
});
