import "server-only";
import { neon } from "@neondatabase/serverless";
import { isAppRole } from "@/lib/auth/permissions";
import { auditHistoryEnabled } from "./feature";
import { auditReaderUrl, requireAuditRead } from "./access";
import {
  auditTimestamp,
  canonicalId,
  InvalidAuditInput,
  parseAuditInput,
} from "./filters";
import type { AuditEvent, AuditState } from "./types";

function eventFromRow(row: Record<string, unknown>): AuditEvent {
  const {
    id,
    action,
    actor_type,
    actor_user_id,
    target_user_id,
    previous_role,
    new_role,
    created_at,
  } = row;
  if (
    typeof id !== "string" ||
    !canonicalId.test(id) ||
    typeof created_at !== "string" ||
    !auditTimestamp.test(created_at) ||
    (previous_role !== null && !isAppRole(previous_role)) ||
    !isAppRole(new_role) ||
    !(
      (action === "owner_bootstrap" && actor_type === "system_bootstrap") ||
      (action === "role_assignment" && actor_type === "authenticated_admin")
    )
  )
    throw new Error("Invalid audit response");
  const safeId = (value: unknown) =>
    typeof value === "string" && canonicalId.test(value) ? value : null;
  return {
    id,
    action,
    actorType: actor_type,
    actorId: safeId(actor_user_id),
    targetId: safeId(target_user_id),
    previousRole: previous_role,
    newRole: new_role,
    createdAt: created_at,
  };
}

export async function readAuditHistory(
  form = new FormData(),
): Promise<AuditState> {
  const enabled = auditHistoryEnabled();
  await requireAuditRead();
  if (!enabled) return { status: "disabled" };
  const url = auditReaderUrl();
  if (!url) return { status: "unconfigured" };
  try {
    const input = parseAuditInput(form);
    const sql = neon(url, {
      fetchOptions: { signal: AbortSignal.timeout(7000), cache: "no-store" },
    });
    const rows = await sql.query(
      `SELECT id, action, actor_type, actor_user_id, target_user_id, previous_role, new_role,
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
       FROM skg_private.list_role_audit_events(
         $1::text,$2::text,$3::text,$4::timestamptz,$5::timestamptz,$6::text,
         $7::public.app_role,$8::timestamptz,$9::uuid,$10::integer)
       ORDER BY list_role_audit_events.created_at DESC NULLS LAST, id DESC NULLS LAST`,
      input.parameters,
    );
    const events = rows.slice(0, 25).map(eventFromRow);
    const last = events.at(-1);
    return {
      status: "ready",
      page: {
        events,
        nextCursor:
          rows.length > 25 && last
            ? input.cursorFor(last.createdAt, last.id)
            : null,
      },
    };
  } catch (error) {
    return {
      status: error instanceof InvalidAuditInput ? error.status : "unavailable",
    };
  }
}
