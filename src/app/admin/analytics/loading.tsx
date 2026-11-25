import styles from "@/components/admin/users.module.css";

export default function AnalyticsLoading() {
  return (
    <main className={`container ${styles.page}`} aria-busy="true">
      <header className={styles.header}>
        <h1>Admin analytics</h1>
      </header>
      <p role="status">Loading recorded activity...</p>
    </main>
  );
}
