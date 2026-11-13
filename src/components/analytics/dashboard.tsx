import { activityBars } from "./activity";
import type { AnalyticsData } from "@/lib/analytics/queries";
import styles from "./dashboard.module.css";

const number = (value: number) => value.toLocaleString("en-US");
function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; results: number }[];
}) {
  const total = rows.reduce((sum, row) => sum + row.results, 0);
  return (
    <section className={`panel ${styles.card}`}>
      <h2>{title}</h2>
      <p className={styles.muted}>Verified canonical results</p>
      <ul className={styles.breakdown}>
        {rows.map((row) => (
          <li key={row.label}>
            <div>
              <span>{row.label}</span>
              <strong>
                {number(row.results)}{" "}
                <small>
                  ({total ? Math.round((row.results / total) * 100) : 0}%)
                </small>
              </strong>
            </div>
            <div className={styles.track} aria-hidden="true">
              <span
                style={{ width: `${total ? (row.results / total) * 100 : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
export function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const weekly = data.window.days === 90;
  const bars = activityBars(data.trend, weekly);
  const peak = Math.max(0, ...bars.map((row) => row.results));
  const maximum = Math.max(1, peak);
  const alibi = data.games.find((game) => game.key === "daily-alibi")!;
  return (
    <>
      {data.overview.results === 0 && (
        <p className={styles.notice} role="status">
          No verified, dated canonical results in this reporting window.
        </p>
      )}
      <section className={styles.kpis} aria-label="Analytics overview">
        {[
          [
            "Verified results",
            data.overview.results,
            "Canonical completed results",
          ],
          [
            "Successful solves",
            data.overview.solves,
            "Verified results marked solved",
          ],
          [
            "Active recorded accounts",
            data.overview.accounts,
            "Distinct accounts with qualifying results, not all visitors",
          ],
        ].map(([label, value, detail]) => (
          <article className={`panel ${styles.card}`} key={label}>
            <h2>{label}</h2>
            <strong className={styles.value}>{number(Number(value))}</strong>
            <p className={styles.muted}>{detail}</p>
          </article>
        ))}
      </section>
      <section
        className={`panel ${styles.card}`}
        aria-labelledby="activity-title"
      >
        <h2 id="activity-title">
          {weekly ? "Weekly recorded activity" : "Daily recorded activity"}
        </h2>
        <p className={styles.muted}>
          Verified results by reported completion date (America/New_York)
        </p>
        <p className={styles.muted}>
          {weekly
            ? "Monday-Sunday calendar weeks; edge weeks include only dates in the selected window."
            : "One bar per calendar day."}{" "}
          Completion dates can be client-reported; undated results are excluded.
          Today may be incomplete.
        </p>
        <div
          className={styles.chart}
          role="img"
          data-period={weekly ? "weekly" : "daily"}
          aria-label={`${weekly ? "Weekly" : "Daily"} verified results from ${data.trend[0].date} to ${data.trend.at(-1)!.date}. Total ${data.overview.results}. Exact values in the table below.`}
        >
          {bars.map((row) => (
            <div
              className={styles.column}
              key={row.startDate}
              title={`${row.startDate}${weekly ? ` through ${row.endDate}` : ""}: ${number(row.results)} results`}
            >
              <span
                className={styles.bar}
                style={{ height: `${(row.results / maximum) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className={styles.chartLabels} aria-hidden="true">
          <span>{data.trend[0].date}</span>
          <span>{data.trend.at(-1)!.date}</span>
        </div>
        <p className={styles.muted}>
          Blue bars: verified results. Highest {weekly ? "week" : "day"}:{" "}
          {number(peak)} results. Window total: {number(data.overview.results)}.
        </p>
        <details>
          <summary>Daily values and chart alternative</summary>
          {weekly && (
            <div
              className={styles.tableScroll}
              role="region"
              aria-label="Weekly activity values"
              tabIndex={0}
            >
              <table>
                <caption>
                  Weekly chart totals (Monday-Sunday, clipped to the selected
                  window)
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Included dates</th>
                    <th scope="col">Results</th>
                  </tr>
                </thead>
                <tbody>
                  {bars.map((bar) => (
                    <tr key={bar.weekStart}>
                      <th scope="row">
                        {bar.startDate} to {bar.endDate}
                      </th>
                      <td>{number(bar.results)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div
            className={styles.tableScroll}
            role="region"
            aria-label="Scrollable analytics table"
            tabIndex={0}
          >
            <table>
              <caption>Verified results per New York calendar day</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Results</th>
                </tr>
              </thead>
              <tbody>
                {data.trend.map((row) => (
                  <tr key={row.date}>
                    <th scope="row">{row.date}</th>
                    <td>{number(row.results)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <div className={styles.twoColumns}>
        <Breakdown title="Game popularity" rows={data.games} />
        <Breakdown title="Daily vs. Practice" rows={data.modes} />
      </div>
      <section className={`panel ${styles.card}`}>
        <h2>Perfect Stack difficulty</h2>
        <p className={styles.muted}>
          Result counts include daily and practice. Averages are recorded
          gameplay measurements from solved, verified results with valid values;
          missing measurements are excluded independently.
        </p>
        <p id="stack-scroll-hint" className={styles.scrollHint}>
          More columns available: scroll horizontally. Focus the table and use
          arrow keys with a keyboard.
        </p>
        <div
          className={styles.tableScroll}
          role="region"
          aria-label="Perfect Stack measurements"
          aria-describedby="stack-scroll-hint"
          tabIndex={0}
        >
          <table>
            <caption>
              Perfect Stack results and recorded gameplay measurements
            </caption>
            <thead>
              <tr>
                <th scope="col">Difficulty</th>
                <th scope="col">Results</th>
                <th scope="col">Average moves</th>
                <th scope="col">Average duration</th>
              </tr>
            </thead>
            <tbody>
              {data.difficulties.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  <td>{number(row.results)}</td>
                  <td>
                    {row.averageMoves === null
                      ? "Not recorded"
                      : row.averageMoves.toFixed(1)}
                  </td>
                  <td>
                    {row.averageDurationMs === null
                      ? "Not recorded"
                      : `${(row.averageDurationMs / 1000).toFixed(1)} s`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className={`panel ${styles.card}`}>
        <h2>Daily Alibi solve rate</h2>
        <strong className={styles.value}>
          {data.alibiSolveRate === null
            ? "No accusations yet"
            : `${(data.alibiSolveRate * 100).toFixed(1)}%`}
        </strong>
        <p>
          {number(alibi.solves)} successful accusations out of{" "}
          {number(alibi.results)} verified finalized accusations.
        </p>
        <p className={styles.muted}>
          An incorrect accusation is a completed result, not a successful solve.
        </p>
      </section>
      <section className={`panel ${styles.card}`}>
        <details className={styles.metricDetails}>
          <summary>How these metrics are calculated</summary>
          <ul className={styles.definitions}>
            <li>
              Results are completed, canonical records with verified=true. Daily
              Alibi keeps the first accusation; daily Stack keeps the best
              result by moves, time, then event ID. Practice counts distinct
              persisted result events.
            </li>
            <li>
              Deduplication happens across history before verification and date
              filtering. Legacy unverified canonical records can exclude a later
              verified duplicate. Unknown games and unsupported Alibi practice
              records are excluded.
            </li>
            <li>
              Completion dates can be client-reported. Undated canonical results
              are excluded; challenge dates and start times never replace
              missing completion timestamps. The selected window includes today.
            </li>
            <li>
              Active recorded accounts are distinct current account owners of
              qualifying results, not all visitors or registrations. Claimed
              progress uses its current account owner; anonymous IDs are not
              unique people.
            </li>
            <li>
              Only persisted activity is visible. Local-only play, missing
              syncs, legacy records and account transfers can affect totals.
              Persistence acknowledgments are not new unique completions.
            </li>
          </ul>
        </details>
      </section>
    </>
  );
}
