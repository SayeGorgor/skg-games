"use client";
import { useState, useTransition } from "react";
import { searchUsers } from "@/app/admin/users/actions";
import type { DirectoryState } from "@/lib/admin/users/types";
import styles from "./users.module.css";
import { RoleAvailability } from "./role-availability";
import type { RoleManagementActor } from "@/lib/admin/users/role-management";
const roles = ["all", "owner", "admin", "analyst", "player"] as const;
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
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
  actor,
}: {
  initial: DirectoryState;
  actor?: RoleManagementActor | null;
}) {
  const [state, setState] = useState(initial),
    [pending, startTransition] = useTransition();
  const result = state.result;
  const [search, setSearch] = useState(initial.result?.filters.search ?? "");
  const [role, setRole] = useState<string>(
    initial.result?.filters.role ?? "all",
  );
  const [pageSize, setPageSize] = useState(
    String(initial.result?.filters.pageSize ?? 25),
  );
  const submit = (form: FormData) =>
    startTransition(async () => {
      setState(await searchUsers(form));
    });
  return (
    <form
      action={submit}
      className={styles.directory}
      aria-busy={pending}
      // Keep controlled filter selections when React resets a successful form action.
      onReset={(event) => event.preventDefault()}
    >
      <fieldset disabled={pending} className={`panel ${styles.controls}`}>
        <legend className={styles.srOnly}>Directory filters</legend>
        <div className={styles.search}>
          <label htmlFor="user-search">Find an account</label>
          <input
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
          disabled={pending}
        >
          {pending ? "Loading..." : "Apply filters"}
        </button>
      </fieldset>
      <noscript>
        Enable JavaScript to search and paginate. The initial results remain
        readable.
      </noscript>
      {actor && (
        <p
          id="role-management-unavailable"
          className={styles.notice}
          role="status"
        >
          Role management is unavailable pending database security review. This
          directory remains read only.
        </p>
      )}
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
              <p>
                Adjust the filters or return to the first page. No account
                changes are available here.
              </p>
            </div>
          ) : (
            <>
              <p className={styles.scrollHint} id="users-scroll-help">
                Scroll for more columns. Keyboard users can focus the table and
                use arrow keys.
              </p>
              <div
                className={styles.tableScroll}
                tabIndex={0}
                role="region"
                aria-label="User directory table"
                aria-describedby="users-scroll-help"
              >
                <table>
                  <caption className={styles.caption}>
                    Read-only{" "}
                    {result.source.kind === "auth"
                      ? "registered account"
                      : "application profile"}{" "}
                    directory. Dates shown in America/New_York.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">User</th>
                      <th scope="col">Email</th>
                      <th scope="col">Role</th>
                      <th scope="col">{result.source.dateLabel}</th>
                      <th scope="col">User ID</th>
                      {actor && <th scope="col">Role management</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {result.entries.map((entry) => (
                      <tr key={entry.userId}>
                        <th scope="row" className={styles.name}>
                          {entry.displayName ?? "Name not available"}
                        </th>
                        <td className={styles.email}>
                          {entry.email ?? "Not available"}
                        </td>
                        <td>
                          <span
                            className={`${styles.badge} ${styles[entry.role]}`}
                          >
                            {label(entry.role)}
                          </span>
                        </td>
                        <td>
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
                        <td>
                          <CopyUserId id={entry.userId} />
                        </td>
                        {actor && (
                          <td>
                            <RoleAvailability actor={actor} target={entry} />
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
                disabled={pending || !result.previousCursor}
              >
                Previous
              </button>
              <button
                type="submit"
                name="page"
                value="first"
                disabled={pending}
              >
                First page
              </button>
              <button
                type="submit"
                name="page"
                value={`next:${result.nextCursor ?? ""}`}
                disabled={pending || !result.nextCursor}
              >
                Next
              </button>
            </div>
          </nav>
        </section>
      )}
      <p className={styles.muted}>
        Read only. Role changes, account deletion and subscription changes are
        not available in this phase.
      </p>
    </form>
  );
}
