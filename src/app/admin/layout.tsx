import { auditHistoryEnabled } from "@/lib/admin/audit/feature";
import { notFound } from "next/navigation";
import { getCurrentUserRole } from "@/lib/auth/authorization";
import { hasPermission } from "@/lib/auth/permissions";
import { AdminNavigation } from "@/components/admin/navigation";

/** Shared shell only: each feature layout/page/data boundary authorizes itself. */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getCurrentUserRole();
  if (
    !hasPermission(role, "analytics:read") &&
    !hasPermission(role, "users:read")
  )
    notFound();
  return (
    <>
      <AdminNavigation role={role} auditEnabled={auditHistoryEnabled()} />
      {children}
    </>
  );
}
