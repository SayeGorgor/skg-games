"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useViewer } from "./auth/viewer-provider";
import {
  localResults,
  RESULTS_CHANGED,
  storageUnavailable,
} from "@/lib/results/local";
import {
  GAME_NAMES,
  summarize,
  uniqueHistory,
  type GameSlug,
  type HistoryResult,
} from "@/lib/results/shared";
type Summary = ReturnType<typeof summarize>;
type AccountStats = {
  summary: Summary;
  results: HistoryResult[];
  total: number;
  pageSize: number;
  accountKey: string;
};
const duration = (ms: number) =>
  `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
function completedDate(row: HistoryResult) {
  if (row.completedAt)
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(row.completedAt));
  if (row.challengeDate)
    return `${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(row.challengeDate + "T12:00:00Z"))} · puzzle date`;
  return "Completion date unavailable";
}
export function StatsClient() {
  const { viewer, syncStatus, syncError, retryResults } = useViewer();
  const [local, setLocal] = useState<{
    scope: string | null;
    rows: HistoryResult[];
  }>({ scope: null, rows: [] });
  const [account, setAccount] = useState<AccountStats | null>(null);
  const [game, setGame] = useState<GameSlug | "">("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const scope = viewer.authenticated ? (viewer.accountKey ?? null) : null;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLocal({ scope, rows: localResults(scope) });
      setStorageWarning(storageUnavailable());
      if (!viewer.authenticated || !scope) {
        setAccount(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/stats?${new URLSearchParams({ page: String(page), ...(game ? { game } : {}) })}`,
          { cache: "no-store", signal },
        );
        if (!response.ok)
          throw new Error(
            "Your account history is temporarily unavailable. Your browser results are still safe.",
          );
        const data: AccountStats = await response.json();
        if (data.accountKey !== scope)
          throw new Error(
            "Your account changed. Refresh to see your statistics.",
          );
        setAccount(data);
      } catch (err) {
        if (signal?.aborted) return;
        setError(
          err instanceof Error ? err.message : "Could not load history.",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [scope, viewer.authenticated, game, page],
  );
  useEffect(() => {
    const controller = new AbortController();
    const frame = requestAnimationFrame(() => void load(controller.signal));
    const refresh = () => void load(controller.signal);
    window.addEventListener("skg-results-synced", refresh);
    window.addEventListener(RESULTS_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      cancelAnimationFrame(frame);
      controller.abort();
      window.removeEventListener("skg-results-synced", refresh);
      window.removeEventListener(RESULTS_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [load]);
  const safeAccount = account?.accountKey === scope ? account : null;
  const fallback = uniqueHistory(local.scope === scope ? local.rows : []);
  const summary = safeAccount?.summary ?? summarize(fallback);
  const filtered = game
    ? fallback.filter((r) => r.gameSlug === game)
    : fallback;
  const rows =
    safeAccount?.results ?? filtered.slice((page - 1) * 25, page * 25);
  const total = safeAccount?.total ?? filtered.length;
  if (!viewer.authenticated) {
    return (
      <section
        className="container stats-page stats-signed-out"
        aria-labelledby="stats-sign-in-title"
      >
        <div className="stats-sign-in-content">
          <h1 id="stats-sign-in-title">Your progress, wherever you play.</h1>
          <p>
            Your results are saved in this browser. Create an account to keep
            them across devices.
          </p>
          <div className="button-row">
            <Link
              className="button primary"
              href="/auth/sign-up?returnTo=%2Fstats"
            >
              Create an account
            </Link>
            <Link
              className="button secondary"
              href="/auth/sign-in?returnTo=%2Fstats"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="container stats-page">
      <div className="stats-intro">
        <span className="eyebrow gold">YOUR PLAY, OVER TIME</span>
        <h1>A little progress. Every day.</h1>
        <p className="lede">
          Your finished challenges, personal bests, and the days you kept coming
          back.
        </p>
      </div>
      {viewer.authenticated && (
        <div className="stats-sync" role="status">
          {syncStatus === "syncing"
            ? "Saving your browser results to your account..."
            : syncStatus === "error"
              ? syncError
              : "Your account history"}
          {syncStatus === "saved" && " · Up to date"}
          {syncStatus === "error" && (
            <button
              className="button secondary"
              onClick={() => void retryResults()}
            >
              Retry sync
            </button>
          )}
        </div>
      )}
      {storageWarning && (
        <p role="alert">
          Browser storage is unavailable. Keep this tab open and enable storage
          to preserve your latest result.
        </p>
      )}
      {error && (
        <div className="panel" role="alert">
          <p>{error}</p>
          <button className="button secondary" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}
      {loading && <p role="status">Loading your history...</p>}
      <div className="stats-overview" aria-label="Overall statistics">
        <article className="panel">
          <span className="eyebrow">COMPLETED</span>
          <strong>{summary.total}</strong>
          <p>Finished games</p>
        </article>
        <article className="panel">
          <span className="eyebrow">EXPLORED</span>
          <strong>{summary.games}</strong>
          <p>Different games</p>
        </article>
        <article className="panel">
          <span className="eyebrow">CASES SOLVED</span>
          <strong>{summary.alibiWon}</strong>
          <p>
            {summary.alibiPlayed
              ? `${Math.round((summary.alibiWon / summary.alibiPlayed) * 100)}% Daily Alibi win rate`
              : "Your next mystery awaits"}
          </p>
        </article>
      </div>
      {summary.total === 0 && !loading && (
        <div className="panel stats-empty">
          <h2>Your next game starts your story.</h2>
          <p>
            Finish a daily challenge or a Practice puzzle to see your results
            here.
          </p>
          <Link className="button primary" href="/#games">
            Play today&apos;s games
          </Link>
        </div>
      )}
      <div className="stats-game-grid">
        {summary.byGame
          .filter((s) => s.slug === "perfect-stack" || s.played > 0)
          .sort(
            (a, b) =>
              Number(b.slug === "perfect-stack") -
              Number(a.slug === "perfect-stack"),
          )
          .map((s) => (
            <article className="panel" key={s.slug}>
              <span
                className={`eyebrow ${s.slug === "daily-alibi" ? "red" : "blue"}`}
              >
                YOUR {s.slug === "daily-alibi" ? "CASES" : "STACKS"}
              </span>
              <h2>{GAME_NAMES[s.slug]}</h2>
              <dl className="stats-metrics">
                <div>
                  <dt>Completed</dt>
                  <dd>{s.played}</dd>
                </div>
                {s.slug === "daily-alibi" && (
                  <>
                    <div>
                      <dt>Won</dt>
                      <dd>{s.won}</dd>
                    </div>
                    <div>
                      <dt>Win rate</dt>
                      <dd>{Math.round((s.won / s.played) * 100)}%</dd>
                    </div>
                  </>
                )}
                <div>
                  <dt>Current daily streak</dt>
                  <dd>
                    {s.streak.current} {s.streak.current === 1 ? "day" : "days"}
                  </dd>
                </div>
                <div>
                  <dt>Longest daily streak</dt>
                  <dd>
                    {s.streak.longest} {s.streak.longest === 1 ? "day" : "days"}
                  </dd>
                </div>
              </dl>
              {s.slug === "perfect-stack" &&
                s.difficulties.map((d) => (
                  <div className="stats-difficulty" key={d.difficulty}>
                    <h3>
                      {
                        { small: "Small", medium: "Medium", hard: "Large" }[
                          d.difficulty
                        ]
                      }
                    </h3>
                    <p>
                      {d.played} completed
                      {` · Best: ${d.fewestMoves ?? "N/A"} moves`}
                      {` · Average: ${d.averageMs === null ? "N/A" : duration(d.averageMs)}`}
                    </p>
                  </div>
                ))}
            </article>
          ))}
      </div>
      <p className="stats-caption">
        Daily streaks count successful puzzle dates. Multiple difficulties on
        one day count as one day.
      </p>
      <section className="stats-history" aria-labelledby="history-heading">
        <div className="section-heading">
          <h2 id="history-heading">Your game history</h2>
          <label>
            Game{" "}
            <span className="stats-game-select">
              <select
                value={game}
                onChange={(e) => {
                  setGame(e.target.value as GameSlug | "");
                  setPage(1);
                }}
              >
                <option value="">All games</option>
                {Object.entries(GAME_NAMES).map(([slug, name]) => (
                  <option key={slug} value={slug}>
                    {name}
                  </option>
                ))}
              </select>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </label>
        </div>
        <p className="stats-caption">
          Completion times use your local timezone. Moves and durations are
          self-reported personal statistics, not competitive rankings.
          {viewer.authenticated &&
            " Results waiting to sync appear online after a successful upload."}
        </p>
        <ol className="stats-history-list">
          {rows.map((row) => (
            <li className="panel" key={row.eventId}>
              <div>
                <strong>{GAME_NAMES[row.gameSlug]}</strong>
                <span className="stats-history-detail">
                  {row.mode === "daily" ? "Daily" : "Practice"}
                  {row.difficulty && ` · ${row.difficulty}`}
                  {row.challengeNumber !== null && ` · #${row.challengeNumber}`}
                </span>
                <time
                  dateTime={row.completedAt ?? row.challengeDate ?? undefined}
                >
                  {completedDate(row)}
                </time>
              </div>
              <div className="stats-history-result">
                <strong className={row.solved ? "blue" : "red"}>
                  {row.gameSlug === "daily-alibi"
                    ? row.solved
                      ? "Won"
                      : "Lost"
                    : "Completed"}
                </strong>
                <span>
                  {row.moves !== null && `${row.moves} moves`}
                  {row.durationMs !== null && ` · ${duration(row.durationMs)}`}
                </span>
              </div>
            </li>
          ))}
        </ol>
        {!rows.length && summary.total > 0 && (
          <p>No completed games match this filter.</p>
        )}
        {total > 25 && (
          <nav className="stats-pagination" aria-label="History pages">
            <button
              className="button secondary"
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span aria-live="polite">
              Page {page} of {Math.ceil(total / 25)}
            </span>
            <button
              className="button secondary"
              disabled={page * 25 >= total || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </nav>
        )}
      </section>
    </section>
  );
}
