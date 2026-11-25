import styles from "@/components/admin/users.module.css";

export default function AuditLoading() {
  return (
    <main className={`container ${styles.page}`} aria-busy="true">
      <header className={styles.header}>
        <h1>Audit History</h1>
      </header>
      <p role="status">Loading audit history...</p>
    </main>
  );
}
