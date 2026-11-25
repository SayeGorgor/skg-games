"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { requestRoleChange } from "@/app/admin/users/role-actions";
import type { AppRole } from "@/lib/auth/permissions";
import {
  RoleEditor,
  roleLabel as label,
  type RoleEditorTarget,
} from "./role-editor";
import { searchUsers } from "@/app/admin/users/actions";
import type { DirectoryState } from "@/lib/admin/users/types";
import styles from "./users.module.css";
import { RoleAvailability } from "./role-availability";
import type { RoleManagementActor } from "@/lib/admin/users/role-management";
const roles = ["all", "owner", "admin", "analyst", "player"] as const;
function mutationMessage(status: unknown) {
  switch (status) {
    case "success":
      return "Application role changed.";
    case "forbidden":
      return "You are not authorized to make this role change.";
    case "stale_state":
      return "This account's role changed since you opened the dialog. Review the current role and confirm again.";
    case "not_found":
      return "The account is unavailable for role changes.";
    case "no_change":
      return "No role change was needed.";
    default:
      return "The role change outcome could not be confirmed. Check the current role before trying again.";
  }
}
const directoryError: DirectoryState = {
  status: "error",
  result: null,
  message:
    "The user directory could not be refreshed. Apply filters to try again.",
};
export function CopyUserId({ id }: { id: string }) {
  const [status, setStatus] = useState("");
  return (
    <span className={styles.idControl}>
      <code title={id}>
        {id.length > 18 ? `${id.slice(0, 8)}...${id.slice(-6)}` : id}
      </code>
      <button
        type="button"
        aria-label="Copy full immutable user ID"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(id);
            setStatus("Copied");
          } catch {
            setStatus("Copy unavailable; select the ID to copy manually.");
          }
        }}
      >
        Copy
      </button>
      <span className={styles.copyStatus} role="status">
        {status}
      </span>
      {status.startsWith("Copy unavailable") && (
        <input
          aria-label="Full user ID for manual copy"
          readOnly
          value={id}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </span>
  );
}
export function UserDirectory({
  initial,
  actor: initialActor,
}: {
  initial: DirectoryState;
  actor?: RoleManagementActor | null;
}) {
  const [state, setState] = useState(initial),
    [pending, startTransition] = useTransition();
  const result = state.result;
  const actor =
    state.roleManagementActor === undefined
      ? initialActor
      : state.roleManagementActor;
  const enabled = state.roleManagementEnabled === true && !!actor;
  const [editor, setEditor] = useState<{
    target: RoleEditorTarget;
    destinations: AppRole[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const mutationInFlight = useRef(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const busy = pending || saving;
  useEffect(() => {
    if (editor || busy || !opener.current) return;
    const button = opener.current;
    opener.current = null;
    (button.isConnected && !button.disabled
      ? button
      : searchInput.current
    )?.focus();
  }, [editor, busy]);
  const [search, setSearch] = useState(initial.result?.filters.search ?? "");
  const [role, setRole] = useState<string>(
    initial.result?.filters.role ?? "all",
  );
  const [pageSize, setPageSize] = useState(
    String(initial.result?.filters.pageSize ?? 25),
  );
  const submit = (form: FormData) =>
    startTransition(async () => {
      setAnnouncement("");
      try {
        setState(await searchUsers(form));
      } catch {
        setState(directoryError);
      }
    });
  async function confirmRole(requestedRole: AppRole) {
    if (
      !editor ||
      !result ||
      !enabled ||
      mutationInFlight.current ||
      !editor.destinations.includes(requestedRole)
    )
      return;
    mutationInFlight.current = true;
    setSaving(true);
    setAnnouncement("");
    const { target } = editor;
    const { filters } = result;
    let status: unknown;
    try {
      const response = await requestRoleChange({
        targetId: target.userId,
        requestedRole,
        expectedRole: target.roleSnapshot.storedRole,
        expectedRevision: target.roleSnapshot.roleRevision,
      });
      status = response?.status;
    } catch {
      // A transport failure can occur after a database commit.
    }
    const form = new FormData();
    form.set("search", filters.search);
    form.set("role", filters.role);
    form.set("pageSize", String(filters.pageSize));
    form.set("page", state.page ?? "first");
    try {
      setState(await searchUsers(form));
    } catch {
      setState(directoryError);
    } finally {
      setEditor(null);
      setAnnouncement(mutationMessage(status));
      mutationInFlight.current = false;
      setSaving(false);
    }
  }
  return (
    <>
      <form
        action={submit}
        className={styles.directory}
        aria-busy={busy}
        // Keep controlled filter selections when React resets a successful form action.
        onReset={(event) => event.preventDefault()}
      >
        <fieldset disabled={busy} className={`panel ${styles.controls}`}>
          <legend className={styles.srOnly}>Directory filters</legend>
          <div className={styles.search}>
            <label htmlFor="user-search">Find an account</label>
            <input
              ref={searchInput}
              id="user-search"
              name="search"
              type="search"
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              placeholder="Email, display name or exact user ID"
              aria-describedby="search-help"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <small id="search-help">
              Use 2-120 characters, or leave empty. Search stays out of the URL.
            </small>
          </div>
          <div>
            <label htmlFor="user-role">Application role</label>
            <select
              id="user-role"
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              {roles.map((role) => (
                <option value={role} key={role}>
                  {role === "all" ? "All roles" : label(role)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="user-page-size">Per page</label>
            <select
              id="user-page-size"
              name="pageSize"
              value={pageSize}
              onChange={(event) => setPageSize(event.target.value)}
            >
              <option>25</option>
              <option>50</option>
            </select>
          </div>
          <button
            className={styles.primary}
            type="submit"
            name="page"
            value="first"
            disabled={busy}
          >
            {pending ? "Loading..." : "Apply filters"}
          </button>
        </fieldset>
        <noscript>
          Enable JavaScript to search and paginate. The initial results remain
          readable.
        </noscript>
        {actor && !enabled && (
          <p
            id="role-management-unavailable"
            className={styles.notice}
            role="status"
          >
            Role management is unavailable. Read only access is available.
          </p>
        )}
        <div
          role="status"
          aria-atomic="true"
          className={announcement ? styles.notice : undefined}
        >
          {announcement}
        </div>
        {state.message && (
          <p className={styles.notice} role="alert">
            {state.message}
          </p>
        )}
        {result && (
          <section className={`panel ${styles.results}`}>
            <div className={styles.resultHeading}>
              <h2>
                {result.source.kind === "auth"
                  ? "Registered accounts"
                  : "Application profiles"}
              </h2>
              <strong>
                {result.total.toLocaleString("en-US")}{" "}
                {result.filters.search || result.filters.role !== "all"
                  ? "matching"
                  : "recorded"}{" "}
                {result.source.kind === "auth" ? "accounts" : "profiles"}
              </strong>
            </div>
            <p className={styles.muted}>{result.source.coverage}</p>
            <p className={styles.muted}>{result.source.emailNote}</p>
            {!result.entries.length ? (
              <div className={styles.empty} role="status">
                <h3>
                  {result.filters.search
                    ? "No results match your search"
                    : result.filters.role !== "all"
                      ? result.source.kind === "auth"
                        ? "No accounts have the selected role"
                        : "No profiles have the selected role"
                      : result.source.kind === "auth"
                        ? "No registered accounts found"
                        : "No application profiles found"}
                </h3>
                <p>Adjust the filters or return to the first page.</p>
              </div>
            ) : (
              <>
                <p className={styles.scrollHint} id="users-scroll-help">
                  Scroll for more columns. Keyboard users can focus the table
                  and use arrow keys.
                </p>
                <div
                  className={styles.tableScroll}
                  tabIndex={0}
                  role="region"
                  aria-label="User directory table"
                  aria-describedby="users-scroll-help"
                >
                  <table role="table">
                    <caption className={styles.caption}>
                      {enabled ? "" : "Read-only "}
                      {result.source.kind === "auth"
                        ? "registered account"
                        : "application profile"}{" "}
                      directory. Dates shown in America/New_York.
                    </caption>
                    <thead role="rowgroup">
                      <tr role="row">
                        <th role="columnheader" scope="col">
                          User
                        </th>
                        <th role="columnheader" scope="col">
                          Email
                        </th>
                        <th role="columnheader" scope="col">
                          Role
                        </th>
                        <th role="columnheader" scope="col">
                          {result.source.dateLabel}
                        </th>
                        <th role="columnheader" scope="col">
                          User ID
                        </th>
                        {actor && (
                          <th role="columnheader" scope="col">
                            Role management
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {result.entries.map((entry) => (
                        <tr role="row" key={entry.userId}>
                          <th
                            role="rowheader"
                            scope="row"
                            className={styles.name}
                          >
                            {entry.displayName ?? "Name not available"}
                          </th>
                          <td
                            role="cell"
                            data-label="Email"
                            className={styles.email}
                          >
                            {entry.email ?? "Not available"}
                          </td>
                          <td role="cell" data-label="Role">
                            <span
                              className={`${styles.badge} ${styles[entry.role]}`}
                            >
                              {label(entry.role)}
                            </span>
                          </td>
                          <td role="cell" data-label={result.source.dateLabel}>
                            {entry.createdAt ? (
                              <time dateTime={entry.createdAt}>
                                {new Intl.DateTimeFormat("en-US", {
                                  timeZone: "America/New_York",
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                }).format(new Date(entry.createdAt))}
                              </time>
                            ) : (
                              "Not available"
                            )}
                          </td>
                          <td role="cell" data-label="User ID">
                            <CopyUserId id={entry.userId} />
                          </td>
                          {actor && (
                            <td role="cell" data-label="Role management">
                              <RoleAvailability
                                actor={actor}
                                target={entry}
                                enabled={enabled}
                                pending={busy}
                                onManage={(target, destinations, button) => {
                                  opener.current = button;
                                  setEditor({ target, destinations });
                                }}
                              />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <nav className={styles.pagination} aria-label="Directory pages">
              <span>
                Showing {result.entries.length} of{" "}
                {result.total.toLocaleString("en-US")} matching{" "}
                {result.source.kind === "auth" ? "accounts" : "profiles"}
              </span>
              <div>
                <button
                  type="submit"
                  name="page"
                  value={`previous:${result.previousCursor ?? ""}`}
                  disabled={busy || !result.previousCursor}
                >
                  Previous
                </button>
                <button type="submit" name="page" value="first" disabled={busy}>
                  First page
                </button>
                <button
                  type="submit"
                  name="page"
                  value={`next:${result.nextCursor ?? ""}`}
                  disabled={busy || !result.nextCursor}
                >
                  Next
                </button>
              </div>
            </nav>
          </section>
        )}
        {!initialActor && !enabled && (
          <p className={styles.muted}>Read only.</p>
        )}
      </form>
      {editor && (
        <RoleEditor
          target={editor.target}
          destinations={editor.destinations}
          pending={saving}
          onCancel={() => {
            if (!mutationInFlight.current) setEditor(null);
          }}
          onConfirm={confirmRole}
        />
      )}
    </>
  );
}
