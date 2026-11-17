import "server-only";
import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/authorization";
import { isAppRole } from "@/lib/auth/permissions";
import {
  DirectoryInputError,
  escapeDirectorySearch,
  hasControlCharacters,
  parseDirectoryFilters,
} from "./filters";
import type {
  DirectoryInput,
  DirectoryResult,
  DirectorySource,
  DirectoryFilters,
  DirectoryEntry,
} from "./types";
type Db = NonNullable<ReturnType<typeof getDb>>;
type Capability = {
  column_name: string;
  type: string;
  readable: boolean;
  complete: boolean;
};
type Source = {
  from: SQL;
  id: SQL;
  name: SQL;
  email: SQL;
  date: SQL;
  key: string;
  info: DirectorySource;
};
async function directorySource(db: Db): Promise<Source> {
  // Metadata only on the existing application connection. Never grant privileges,
  // change roles, use operator credentials or guess managed column names.
  const { rows } =
    await db.execute<Capability>(sql`SELECT a.attname AS column_name,t.typname AS type,
    (has_schema_privilege(n.oid,'USAGE') AND has_column_privilege(c.oid,a.attname,'SELECT')) AS readable,
    (NOT c.relrowsecurity OR r.rolsuper OR r.rolbypassrls OR (r.oid=c.relowner AND NOT c.relforcerowsecurity)) AS complete
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    JOIN pg_catalog.pg_type t ON t.oid=a.atttypid JOIN pg_catalog.pg_roles r ON r.rolname=current_user
    WHERE n.nspname='neon_auth' AND c.relname='user' AND c.relkind IN ('r','p')
      AND a.attname IN ('id','name','email','createdAt','created_at')`);
  const column = (name: string, types: string[]) =>
    rows.some(
      (r) =>
        r.column_name === name &&
        r.readable &&
        r.complete &&
        types.includes(r.type),
    );
  if (column("id", ["uuid"])) {
    const name = column("name", ["text", "varchar"]),
      email = column("email", ["text", "varchar"]);
    const camel = column("createdAt", ["timestamptz"]),
      snake = column("created_at", ["timestamptz"]);
    return {
      from: sql`neon_auth."user" a LEFT JOIN public.user_profiles p ON p.user_id=a.id::text LEFT JOIN public.user_roles r ON r.user_id=a.id::text`,
      id: sql`a.id::text`,
      name: name
        ? sql`coalesce(nullif(btrim(p.display_name),''),a.name)`
        : sql`p.display_name`,
      email: email ? sql`a.email` : sql`p.email`,
      date: camel
        ? sql`a."createdAt"`
        : snake
          ? sql`a.created_at`
          : sql`NULL::timestamptz`,
      key: `auth:${name}:${email}:${camel}:${snake}`,
      info: {
        kind: "auth",
        dateLabel: camel || snake ? "Joined" : "Account date unavailable",
        coverage:
          "Registered Neon Auth accounts, including accounts without an application profile.",
        emailNote: email
          ? "Email comes from Neon Auth. Display names may include application profile preferences."
          : "Email comes from synchronized application profiles and may be missing or outdated.",
      },
    };
  }
  return {
    from: sql`public.user_profiles p LEFT JOIN public.user_roles r ON r.user_id=p.user_id`,
    id: sql`p.user_id`,
    name: sql`p.display_name`,
    email: sql`p.email`,
    date: sql`p.created_at`,
    key: "profiles",
    info: {
      kind: "profiles",
      dateLabel: "Profile created",
      coverage:
        "Profile directory only. Accounts without synchronized profiles are excluded; these totals are not all signups. Profiles may outlive Auth accounts.",
      emailNote:
        "Profile emails are synchronized when a trusted session is resolved and may be missing or outdated. Profile creation is not the Auth signup date.",
    },
  };
}
type Cursor = { v: 1; binding: string; id: string; date: string | null };
const bindingFor = (filters: DirectoryFilters, source: string) =>
  createHash("sha256")
    .update(JSON.stringify([filters, source]))
    .digest("hex");
function cursorFor(entry: DirectoryEntry, binding: string): string {
  return Buffer.from(
    JSON.stringify({ v: 1, binding, id: entry.userId, date: entry.createdAt }),
  ).toString("base64url");
}
function parseCursor(value: unknown, binding: string): Cursor | null {
  if (value === undefined || value === "") return null;
  if (
    typeof value !== "string" ||
    value.length > 1200 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw new DirectoryInputError();
  try {
    const p = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Cursor;
    if (
      p.v !== 1 ||
      typeof p.id !== "string" ||
      !p.id ||
      p.id.length > 256 ||
      hasControlCharacters(p.id) ||
      typeof p.binding !== "string" ||
      (p.date !== null &&
        (typeof p.date !== "string" ||
          !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$/.test(
            p.date,
          ) ||
          !Number.isFinite(Date.parse(p.date))))
    )
      throw new DirectoryInputError();
    return p.binding === binding ? p : null;
  } catch {
    throw new DirectoryInputError();
  }
}
function pagePredicate(c: Cursor | null, before: boolean): SQL {
  if (!c) return sql`true`;
  if (before)
    return c.date === null
      ? sql`(created_at IS NOT NULL OR (created_at IS NULL AND user_id>${c.id}))`
      : sql`(created_at>${c.date}::timestamptz OR (created_at=${c.date}::timestamptz AND user_id>${c.id}))`;
  return c.date === null
    ? sql`(created_at IS NULL AND user_id<${c.id})`
    : sql`(created_at<${c.date}::timestamptz OR (created_at=${c.date}::timestamptz AND user_id<${c.id}) OR created_at IS NULL)`;
}
export class DirectoryUnavailableError extends Error {
  constructor() {
    super("The user directory is temporarily unavailable. Please try again.");
  }
}
export async function readUserDirectory(
  input: DirectoryInput = {},
): Promise<DirectoryResult> {
  await requirePermission("users:read");
  const filters = parseDirectoryFilters(input);
  if (
    input.direction !== undefined &&
    input.direction !== "next" &&
    input.direction !== "previous"
  )
    throw new DirectoryInputError();
  try {
    const db = getDb();
    if (!db) throw new DirectoryUnavailableError();
    const source = await directorySource(db),
      binding = bindingFor(filters, source.key);
    const cursor = parseCursor(input.cursor, binding),
      before = !!cursor && input.direction === "previous";
    const pattern = `%${escapeDirectorySearch(filters.search)}%`;
    const search = filters.search
      ? sql`(email ILIKE ${pattern} OR display_name ILIKE ${pattern} OR user_id=${filters.search})`
      : sql`true`;
    const role = filters.role === "all" ? sql`true` : sql`role=${filters.role}`;
    const order = before
      ? sql`created_at ASC NULLS FIRST,user_id ASC`
      : sql`created_at DESC NULLS LAST,user_id DESC`;
    const { rows } = await db.execute<{
      total: string;
      entries: DirectoryEntry[];
      has_previous: boolean;
      has_next: boolean;
    }>(sql`
      WITH base AS (SELECT ${source.id} AS user_id,${source.name} AS display_name,${source.email} AS email,${source.date} AS created_at,
        CASE WHEN r.role::text IN ('owner','admin','analyst','player') THEN r.role::text ELSE 'player' END AS role FROM ${source.from}),
      filtered AS (SELECT * FROM base WHERE ${search} AND ${role}),
      selected AS (SELECT * FROM filtered WHERE ${pagePredicate(cursor, before)} ORDER BY ${order} LIMIT ${filters.pageSize}),
      first_row AS (SELECT * FROM selected ORDER BY created_at DESC NULLS LAST,user_id DESC LIMIT 1),
      last_row AS (SELECT * FROM selected ORDER BY created_at ASC NULLS FIRST,user_id ASC LIMIT 1)
      SELECT (SELECT count(*)::text FROM filtered) AS total,
        coalesce((SELECT jsonb_agg(jsonb_build_object('userId',user_id,'displayName',display_name,'email',email,'role',role,
          'createdAt',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY created_at DESC NULLS LAST,user_id DESC) FROM selected),'[]'::jsonb) AS entries,
        EXISTS (SELECT 1 FROM filtered f,first_row b WHERE f.created_at>b.created_at OR (f.created_at=b.created_at AND f.user_id>b.user_id) OR (b.created_at IS NULL AND (f.created_at IS NOT NULL OR f.user_id>b.user_id))) AS has_previous,
        EXISTS (SELECT 1 FROM filtered f,last_row b WHERE f.created_at<b.created_at OR (f.created_at=b.created_at AND f.user_id<b.user_id) OR (f.created_at IS NULL AND (b.created_at IS NOT NULL OR f.user_id<b.user_id))) AS has_next`);
    const row = rows[0];
    const entries = row.entries.map((e) => ({
      userId: e.userId,
      displayName: e.displayName?.trim() || null,
      email: e.email?.trim() || null,
      role: isAppRole(e.role) ? e.role : ("player" as const),
      createdAt: e.createdAt,
    }));
    return {
      entries,
      total: Number(row.total),
      filters,
      source: source.info,
      nextCursor:
        row.has_next && entries.length
          ? cursorFor(entries.at(-1)!, binding)
          : null,
      previousCursor:
        row.has_previous && entries.length
          ? cursorFor(entries[0], binding)
          : null,
    };
  } catch (error) {
    if (error instanceof DirectoryInputError) throw error;
    throw new DirectoryUnavailableError();
  }
}
