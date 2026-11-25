"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { searchAuditHistory } from "@/app/admin/audit/actions";
import type { AuditEvent, AuditState } from "@/lib/admin/audit/types";
import styles from "./users.module.css";
import audit from "./audit-history.module.css";

const roleOptions = [
  ["player", "Player"],
  ["analyst", "Analyst"],
  ["admin", "Admin"],
  ["owner", "Owner"],
] as const;
const stamp = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const message = {
  disabled: "Audit history is disabled for this deployment.",
  unconfigured: "Audit history access is not configured for this deployment.",
  unavailable: "Audit history could not be retrieved. Try again.",
  invalid_filters: "Check the event filters, account IDs, and UTC date range.",
  invalid_cursor:
    "This page link is no longer valid. Return to the newest events.",
};

function account(id: string | null) {
  return id
    ? `Account ${id.slice(0, 8)}...${id.slice(-6)}`
    : "Account reference unavailable";
}

function AuditRow({ event }: { event: AuditEvent }) {
  const bootstrap = event.action === "owner_bootstrap";
  const label = roleOptions.find(([role]) => role === event.newRole)?.[1];
  const previous =
    event.previousRole === null
      ? "No stored role"
      : roleOptions.find(([role]) => role === event.previousRole)?.[1];
  const time = `${stamp.format(new Date(event.createdAt))} UTC`;
  return (
    <tr role="row">
      <th role="rowheader" scope="row" className={styles.name}>
        {bootstrap ? "Initial Owner bootstrap" : "Role assignment"}
        <details className={audit.details}>
          <summary>Event details</summary>
          <dl>
            <dt>Event ID</dt>
            <dd>
              <code>{event.id}</code>
            </dd>
            <dt>Recorded at</dt>
            <dd>
              <time dateTime={event.createdAt}>{event.createdAt}</time>
            </dd>
            <dt>Initiator type</dt>
            <dd>
              {bootstrap ? "Operator bootstrap" : "Signed-in administrator"}
            </dd>
            {event.actorId && (
              <>
                <dt>Initiator ID</dt>
                <dd>
                  <code>{event.actorId}</code>
                </dd>
              </>
            )}
            {event.targetId && (
              <>
                <dt>Affected account ID</dt>
                <dd>
                  <code>{event.targetId}</code>
                </dd>
              </>
            )}
          </dl>
        </details>
      </th>
      <td role="cell" data-label="Time (UTC)">
        <time dateTime={event.createdAt}>{time}</time>
      </td>
      <td role="cell" data-label="Initiator">
        {bootstrap ? "Operator workflow" : account(event.actorId)}
      </td>
      <td role="cell" data-label="Affected account">
        {account(event.targetId)}
      </td>
      <td role="cell" data-label="Previous role">
        {previous}
      </td>
      <td role="cell" data-label="New role">
        {label}
      </td>
    </tr>
  );
}

export function AuditHistory({ initial }: { initial: AuditState }) {
  const [state, setState] = useState(initial);
  const [period, setPeriod] = useState("all");
  const [dirty, setDirty] = useState(false);
  const [pending, transition] = useTransition();
  const results = useRef<HTMLHeadingElement>(null);
  const focusResults = useRef(false);
  useEffect(() => {
    if (!pending && focusResults.current) {
      focusResults.current = false;
      results.current?.focus();
    }
  }, [pending, state]);
  const page = state.status === "ready" ? state.page : null;
  if (state.status === "disabled" || state.status === "unconfigured")
    return (
      <p className={styles.notice} role="status">
        {message[state.status]}
      </p>
    );

  return (
    <form
      action={(form) =>
        transition(async () => {
          try {
            const response = await searchAuditHistory(form);
            setState(response);
            if (response.status === "ready") setDirty(false);
          } catch {
            setState({ status: "unavailable" });
          }
          focusResults.current = true;
        })
      }
      onReset={(event) => event.preventDefault()}
      onChange={() => setDirty(true)}
    >
      <fieldset className={`panel ${audit.filters}`} disabled={pending}>
        <legend className={styles.srOnly}>Audit filters</legend>
        <label>
          Event
          <select name="action">
            <option value="">All events</option>
            <option value="role_assignment">Role assignment</option>
            <option value="owner_bootstrap">Initial Owner bootstrap</option>
          </select>
        </label>
        <label>
          Date range (UTC)
          <select
            name="period"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option value="all">All dates</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
        {period === "custom" && (
          <>
            <label>
              Start date (UTC)
              <input name="start" type="date" required />
            </label>
            <label>
              End date (UTC)
              <input name="end" type="date" required />
            </label>
          </>
        )}
        <label>
          Initiator account ID
          <input
            name="actor"
            maxLength={36}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label>
          Affected account ID
          <input
            name="target"
            maxLength={36}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label>
          Previous role
          <select name="previous">
            <option value="">Any previous role</option>
            <option value="implicit">No stored role</option>
            {roleOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          New role
          <select name="next">
            <option value="">Any new role</option>
            {roleOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">
          {pending ? "Loading..." : "Apply filters"}
        </button>
      </fieldset>
      <section className={`panel ${styles.results}`} aria-busy={pending}>
        <h2 ref={results} tabIndex={-1} className={audit.heading}>
          Recorded events
        </h2>
        {state.status !== "ready" && (
          <p role="alert" className={styles.notice}>
            {message[state.status]}
          </p>
        )}
        {page && !page.events.length && (
          <p role="status">No events match these filters.</p>
        )}
        {page && page.events.length > 0 && (
          <>
            <p role="status" className={styles.muted}>
              {`Showing ${page.events.length} ${page.events.length === 1 ? "event" : "events"}, newest first within this page.`}
            </p>
            <div
              className={`${styles.tableScroll} ${audit.table}`}
              role="region"
              tabIndex={0}
              aria-label="Role audit events"
            >
              <table role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    {[
                      "Event",
                      "Time (UTC)",
                      "Initiator",
                      "Affected account",
                      "Previous role",
                      "New role",
                    ].map((heading) => (
                      <th key={heading} role="columnheader" scope="col">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {page.events.map((event) => (
                    <AuditRow key={event.id} event={event} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <nav
          aria-label="Audit history pages"
          className={`${styles.pagination} ${audit.pagination}`}
        >
          {page && (
            <button type="submit" disabled={pending}>
              Newest events
            </button>
          )}
          {page?.nextCursor && (
            <button
              type="submit"
              name="cursor"
              value={page.nextCursor}
              disabled={pending || dirty}
            >
              Older events
            </button>
          )}
        </nav>
      </section>
    </form>
  );
}
