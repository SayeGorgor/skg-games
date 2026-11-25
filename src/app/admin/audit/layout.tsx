import { requireAuditRead } from "@/lib/admin/audit/access";

export default async function AuditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuditRead();
  return children;
}
