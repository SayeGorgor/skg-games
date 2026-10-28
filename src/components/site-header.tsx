import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function Brand() {
  return (
    <Link className="brand" href="/">
      <span className="brand-dots">
        <i />
        <i />
        <i />
      </span>
      <strong>SKG GAMES</strong>
    </Link>
  );
}

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className={`site-header ${compact ? "compact" : ""}`}>
      <div className="header-inner">
        <Brand />
        <nav aria-label="Main navigation">
          <Link href="/">Games</Link>
          <a href="#archive">Archive</a>
          <a href="#stats">Stats</a>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <span className="streak-pill header-streak">
            <span className="sr-only">12 day streak</span>
            <span className="streak-full" aria-hidden="true">
              12 DAY STREAK
            </span>
            <span className="streak-short" aria-hidden="true">
              12 days
            </span>
          </span>
          <Link className="header-plus" href="/plus">
            <span className="plus-full">Go ad-free</span>
            <span className="plus-short">Plus</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
