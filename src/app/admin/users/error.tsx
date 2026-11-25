"use client";
import styles from "@/components/admin/users.module.css";

export default function UsersError({ reset }: { reset: () => void }) {
  return (
    <main className={`container ${styles.page}`}>
      <header className={styles.header}>
        <h1>Directory unavailable</h1>
      </header>
      <p role="alert">
        The directory could not be displayed. Please try again.
      </p>
      <button type="button" className="button secondary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
