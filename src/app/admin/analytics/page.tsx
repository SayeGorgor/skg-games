import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireAnalyticsAdmin } from "@/lib/analytics/access";
import { readAnalytics } from "@/lib/analytics/queries";
import { AnalyticsDashboard } from "@/components/analytics/dashboard";
import styles from "@/components/analytics/dashboard.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = {
  title: "Admin Analytics | SKG Games",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAnalyticsAdmin();
  const params = await searchParams;
  const validKeys = Object.keys(params).every((key) => key === "days");
  let data;
  let unavailable = false;
  try {
    data = validKeys ? await readAnalytics(params.days) : null;
  } catch (error) {
    unstable_rethrow(error);
    // Render no query text, credentials, raw records or error details.
    unavailable = true;
  }
  return (
    <main className="site-shell">
      <div className={`container ${styles.page}`}>
        <header className={styles.header}>
          <div>
            <span className="eyebrow blue">OWNER WORKSPACE</span>
            <h1>Recorded game activity</h1>
            <p className={styles.muted}>
              Private analytics | America/New_York | Read only
            </p>
            <Link href="/">Back to games</Link>
          </div>
          <form
            method="get"
            action="/admin/analytics"
            className={styles.filters}
          >
            <label htmlFor="reporting-days">Reporting window</label>
            <select
              id="reporting-days"
              name="days"
              defaultValue={data?.window.days ?? 30}
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
            <button type="submit">Apply</button>
          </form>
        </header>
        {unavailable ? (
          <section className={`panel ${styles.card}`} role="alert">
            <h2>Analytics temporarily unavailable</h2>
            <p>Recorded results could not be retrieved. Try again shortly.</p>
            <Link href="/admin/analytics">Retry analytics</Link>
          </section>
        ) : data ? (
          <AnalyticsDashboard data={data} />
        ) : (
          <section className={`panel ${styles.card}`} role="alert">
            <h2>Invalid reporting window</h2>
            <p>Choose 7, 30 or 90 days using the filter above.</p>
          </section>
        )}
      </div>
    </main>
  );
}
