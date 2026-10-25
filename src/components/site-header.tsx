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
      <Brand />
      <nav>
        <Link href="/">Games</Link>
        <a href="#archive">Archive</a>
        <a href="#stats">Stats</a>
      </nav>
      <div className="header-actions">
        <ThemeToggle />
        <span className="streak-pill">12 DAY STREAK</span>
        <Link className="header-plus" href="/plus">
          Go ad-free
        </Link>
      </div>
    </header>
  );
}
