"use client";
export default function UsersError({ reset }: { reset: () => void }) {
  return (
    <main className="container stats-page">
      <h1>Directory unavailable</h1>
      <p role="alert">
        The directory could not be displayed. Please try again.
      </p>
      <button className="button secondary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
