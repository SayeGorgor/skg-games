export function StatsSkeleton() {
  return (
    <section
      className="container stats-page"
      aria-busy="true"
      aria-label="Your statistics"
    >
      <div className="stats-intro">
        <span className="eyebrow gold">YOUR PLAY, OVER TIME</span>
        <h1>A little progress. Every day.</h1>
        <p className="lede">
          Your finished challenges, personal bests, and the days you kept coming
          back.
        </p>
      </div>
      <p className="stats-sync" role="status">
        Loading your history...
      </p>
      <div aria-hidden="true">
        <div className="stats-overview">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="panel" key={index}>
              <span className="stats-skeleton-line stats-skeleton-label" />
              <span className="stats-skeleton-line stats-skeleton-number" />
              <span className="stats-skeleton-line" />
            </div>
          ))}
        </div>
        <div className="stats-game-grid">
          {Array.from({ length: 2 }, (_, index) => (
            <div className="panel" key={index}>
              <span className="stats-skeleton-line stats-skeleton-label" />
              <span className="stats-skeleton-line stats-skeleton-title" />
              <div className="stats-metrics">
                {Array.from({ length: 4 }, (_, metric) => (
                  <div key={metric}>
                    <span className="stats-skeleton-line" />
                    <span className="stats-skeleton-line stats-skeleton-number" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="stats-history stats-skeleton-history">
          <h2>Your game history</h2>
          <div className="stats-history-list">
            {Array.from({ length: 5 }, (_, index) => (
              <div className="panel" key={index}>
                <span className="stats-skeleton-line stats-skeleton-title" />
                <span className="stats-skeleton-line" />
                <span className="stats-skeleton-line stats-skeleton-label" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
