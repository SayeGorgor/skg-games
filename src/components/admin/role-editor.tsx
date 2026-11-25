import { useEffect, useId, useRef, useState } from "react";
import { hasPermission, type AppRole } from "@/lib/auth/permissions";
import type { DirectoryEntry, RoleSnapshot } from "@/lib/admin/users/types";
import styles from "./users.module.css";

export type RoleEditorTarget = DirectoryEntry & { roleSnapshot: RoleSnapshot };

export const roleLabel = (role: string) =>
  role.charAt(0).toUpperCase() + role.slice(1);

function permissionChanges(current: AppRole, next: AppRole) {
  const changes = [
    ["analytics:read", "access to the private analytics dashboard"],
    ["users:read", "access to the administrative user directory"],
    [
      "roles:assign_lower",
      "permission to manage Player and Analyst roles when role management is enabled",
    ],
  ] as const;
  return changes.flatMap(([permission, description]) => {
    const had = hasPermission(current, permission);
    const willHave = hasPermission(next, permission);
    return had === willHave
      ? []
      : [`This account will ${willHave ? "gain" : "lose"} ${description}.`];
  });
}

export function RoleEditor({
  target,
  destinations,
  pending,
  onCancel,
  onConfirm,
}: {
  target: RoleEditorTarget;
  destinations: AppRole[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: (role: AppRole) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pendingStatus = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const [destination, setDestination] = useState("");
  const selected = destinations.find((role) => role === destination);
  const current = target.roleSnapshot.effectiveRole;
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  useEffect(() => {
    // While all dialog controls are disabled, keep keyboard focus inside the modal.
    if (pending) pendingStatus.current?.focus();
  }, [pending]);

  return (
    <dialog
      ref={dialog}
      className={styles.roleDialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <h2 id={`${id}-title`}>Change application role?</h2>
      <div id={`${id}-description`}>
        <p>
          Account{" "}
          <strong>
            {target.displayName ?? target.email ?? "Selected account"}
          </strong>
        </p>
        <p>
          Current role <strong>{roleLabel(current)}</strong>
        </p>
        {selected &&
          permissionChanges(current, selected).map((change) => (
            <p key={change}>{change}</p>
          ))}
      </div>
      <label htmlFor={`${id}-destination`}>New role</label>
      <select
        id={`${id}-destination`}
        value={destination}
        disabled={pending}
        onChange={(event) => setDestination(event.target.value)}
      >
        <option value="">Select a role</option>
        {destinations.map((role) => (
          <option value={role} key={role}>
            {roleLabel(role)}
          </option>
        ))}
      </select>
      <p ref={pendingStatus} role="status" tabIndex={pending ? 0 : undefined}>
        {pending ? "Submitting the change and checking the directory..." : ""}
      </p>
      <div className={styles.dialogActions}>
        <button type="button" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          disabled={pending || !selected}
          onClick={() => {
            if (selected && !pending) onConfirm(selected);
          }}
        >
          Confirm role change
        </button>
      </div>
    </dialog>
  );
}
