import Link from "next/link";
import { hasPermission, type AppRole } from "@/lib/auth/permissions";
import styles from "./users.module.css";
export function AdminNavigation({
  role,
  auditEnabled = false,
}: {
  role: AppRole;
  auditEnabled?: boolean;
}) {
  return (
    <nav
      className={`container ${styles.navigation}`}
      aria-label="Administration"
    >
      <Link href="/">SKG Games</Link>
      {hasPermission(role, "analytics:read") && (
        <Link href="/admin/analytics" prefetch={false}>
          Analytics
        </Link>
      )}
      {hasPermission(role, "users:read") && (
        <Link href="/admin/users" prefetch={false}>
          User Management
        </Link>
      )}
      {auditEnabled && hasPermission(role, "audit:read") && (
        <Link href="/admin/audit" prefetch={false}>
          Audit History
        </Link>
      )}
    </nav>
  );
}
