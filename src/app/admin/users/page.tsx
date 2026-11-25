import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { requirePermission } from "@/lib/auth/authorization";
import { readUserDirectory } from "@/lib/admin/users/queries";
import { UserDirectory } from "@/components/admin/user-directory";
import type { DirectoryState } from "@/lib/admin/users/types";
import styles from "@/components/admin/users.module.css";
import { getRoleManagementActor } from "@/lib/admin/users/role-management";
import { isRoleManagementEnabled } from "@/lib/admin/users/role-management-feature";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = {
  title: "User Management | SKG Games",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};
export default async function UsersPage() {
  await requirePermission("users:read");
  const actor = await getRoleManagementActor();
  const enabled = !!actor && isRoleManagementEnabled();
  let initial: DirectoryState;
  try {
    initial = {
      status: "ready",
      roleManagementEnabled: enabled,
      result: enabled
        ? await readUserDirectory({}, true)
        : await readUserDirectory(),
    };
  } catch (error) {
    unstable_rethrow(error);
    initial = {
      status: "error",
      result: null,
      message:
        "The user directory is temporarily unavailable. Please try again.",
    };
  }
  return (
    <main className={`container ${styles.page}`}>
      <header className={styles.header}>
        <span className="eyebrow blue">ADMINISTRATION</span>
        <h1>User Management</h1>
        <p>Find accounts and review their application roles.</p>
      </header>
      <UserDirectory initial={initial} actor={actor} />
    </main>
  );
}
