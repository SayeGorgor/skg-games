import "server-only";
import { createHash } from "node:crypto";
import { isAppRole } from "@/lib/auth/permissions";

export const canonicalId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const auditTimestamp =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$/;
const dayMs = 86_400_000;
const fields = [
  "action",
  "actor",
  "target",
  "previous",
  "next",
  "period",
  "start",
  "end",
  "cursor",
];
export class InvalidAuditInput extends Error {
  constructor(readonly status: "invalid_filters" | "invalid_cursor") {
    super(status);
  }
}

export function parseAuditInput(form: FormData, now = new Date()) {
  if (!(form instanceof FormData))
    throw new InvalidAuditInput("invalid_filters");
  const values = new Map<string, string>();
  for (const [key, value] of form.entries()) {
    if (key.startsWith("$ACTION_")) continue;
    if (
      !fields.includes(key) ||
      values.has(key) ||
      typeof value !== "string" ||
      value.length > (key === "cursor" ? 400 : 64)
    )
      throw new InvalidAuditInput(
        key === "cursor" ? "invalid_cursor" : "invalid_filters",
      );
    values.set(key, value.trim());
  }
  const field = (key: string) => values.get(key) || null;
  const action = field("action"),
    actor = field("actor"),
    target = field("target");
  const previous = field("previous"),
    next = field("next"),
    period = field("period") ?? "all";
  if (
    (action && !["owner_bootstrap", "role_assignment"].includes(action)) ||
    (actor && !canonicalId.test(actor)) ||
    (target && !canonicalId.test(target)) ||
    (previous && previous !== "implicit" && !isAppRole(previous)) ||
    (next && !isAppRole(next)) ||
    !["all", "7", "30", "90", "custom"].includes(period)
  )
    throw new InvalidAuditInput("invalid_filters");

  const start = field("start"),
    end = field("end");
  let from: string | null = null,
    until: string | null = null;
  if (period === "custom") {
    function date(value: string | null) {
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new InvalidAuditInput("invalid_filters");
      const time = Date.parse(value);
      if (
        !Number.isFinite(time) ||
        new Date(time).toISOString().slice(0, 10) !== value ||
        !/^[1-9]/.test(value)
      )
        throw new InvalidAuditInput("invalid_filters");
      return time;
    }
    const first = date(start),
      last = date(end);
    if (last < first || last - first >= 366 * dayMs || end === "9999-12-31")
      throw new InvalidAuditInput("invalid_filters");
    from = new Date(first).toISOString();
    until = new Date(last + dayMs).toISOString();
  }
  // Bind the cursor to the submitted filters. For presets, carry the UTC
  // midnight anchor forward so pagination is stable across midnight.
  const binding = createHash("sha256")
    .update(
      JSON.stringify([
        action,
        actor,
        target,
        previous,
        next,
        period,
        from,
        until,
      ]),
    )
    .digest("hex");
  let cursor: { time: string; id: string; anchor: number } | null = null;
  const token = field("cursor");
  const today = Math.floor(now.getTime() / dayMs);
  if (token) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error();
      const [version, hash, time, id, anchor] = JSON.parse(
        Buffer.from(token, "base64url").toString("utf8"),
      );
      if (
        version !== 1 ||
        hash !== binding ||
        typeof time !== "string" ||
        !auditTimestamp.test(time) ||
        !Number.isFinite(Date.parse(time)) ||
        typeof id !== "string" ||
        !canonicalId.test(id) ||
        !Number.isSafeInteger(anchor) ||
        anchor < today - 366 ||
        anchor > today
      )
        throw new Error();
      cursor = { time, id, anchor };
    } catch {
      throw new InvalidAuditInput("invalid_cursor");
    }
  }
  const anchor = cursor?.anchor ?? today;
  if (period !== "all" && period !== "custom") {
    from = new Date((anchor + 1 - Number(period)) * dayMs).toISOString();
    until = new Date((anchor + 1) * dayMs).toISOString();
  }
  return {
    parameters: [
      action,
      actor,
      target,
      from,
      until,
      previous,
      next,
      cursor?.time ?? null,
      cursor?.id ?? null,
      26,
    ],
    cursorFor: (time: string, id: string) =>
      Buffer.from(JSON.stringify([1, binding, time, id, anchor])).toString(
        "base64url",
      ),
  };
}
