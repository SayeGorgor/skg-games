import type { Metadata } from "next";
import { requireAuditRead } from "@/lib/admin/audit/access";
import { readAuditHistory } from "@/lib/admin/audit/reader";
import { AuditHistory } from "@/components/admin/audit-history";
import styles from "@/components/admin/users.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = {
  title: "Audit History | SKG Games",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function AuditPage() {
  await requireAuditRead();
  const initial = await readAuditHistory();
  return (
    <main className={`container ${styles.page}`}>
      <header className={styles.header}>
        <span className="eyebrow blue">ADMINISTRATION / READ ONLY</span>
        <h1>Audit History</h1>
        <p>
          Review recorded application role assignments and the initial Owner
          bootstrap.
        </p>
      </header>
      <AuditHistory initial={initial} />
    </main>
  );
}
