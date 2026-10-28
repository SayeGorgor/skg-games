"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function StackError({ retry }: { retry: () => void }) {
  return (
    <main className="site-shell">
      <SiteHeader />
      <section className="container game-feedback">
        <div className="panel" role="alert">
          <span className="eyebrow blue">PERFECT STACK</span>
          <h1>This board is unavailable right now.</h1>
          <p>Try again, or start a fresh Practice puzzle.</p>
          <div className="button-row">
            <button className="button primary" onClick={retry}>
              Try again
            </button>
            <Link
              className="button secondary"
              href="/games/perfect-stack?mode=practice"
            >
              Play Practice
            </Link>
            <Link className="button secondary" href="/">
              Back to games
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
