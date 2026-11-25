import styles from "@/components/admin/users.module.css";

export default function UsersLoading() {
  return (
    <main className={`container ${styles.page}`} aria-busy="true">
      <header className={styles.header}>
        <h1>User Management</h1>
      </header>
      <p role="status">Loading the private directory...</p>
    </main>
  );
}
