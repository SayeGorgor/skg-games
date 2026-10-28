"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdSlot } from "./ad-slot";
import { SiteHeader } from "./site-header";
import { StackMiniBoard } from "./stack-mini-board";
import { getLocalProgress } from "@/lib/client-progress";
import { getGameDate } from "@/lib/game-date";

function AlibiPreview() {
  return (
    <div className="alibi-preview">
      <small>CASE #127 • THE GALLERY AFTER HOURS</small>
      <div className="fake-line wide" />
      <div className="fake-line" />
      <div className="suspect-dots">
        <span>A</span>
        <span>M</span>
        <span>L</span>
        <span>N</span>
      </div>
    </div>
  );
}

function GameCard({ kind }: { kind: "alibi" | "stack" }) {
  const alibi = kind === "alibi";
  return (
    <Link
      className="game-card"
      href={alibi ? "/games/alibi" : "/games/perfect-stack"}
    >
      {alibi ? (
        <AlibiPreview />
      ) : (
        <div className="stack-preview">
          <StackMiniBoard />
        </div>
      )}
      <span className={`eyebrow ${alibi ? "red" : "blue"}`}>
        {alibi ? "TODAY'S CASE" : "TODAY'S PUZZLE"}
      </span>
      <h3>{alibi ? "Daily Alibi" : "Perfect Stack"}</h3>
      <p>
        {alibi
          ? "Read the case, connect the clues, and accuse one suspect."
          : "Fill every square using every piece. Choose Small, Medium, or Hard."}
      </p>
      <small>
        {alibi ? "3–5 MIN • LOGIC • 1 ATTEMPT" : "2–4 MIN • SPATIAL • DAILY"}
      </small>
      <strong>{alibi ? "PLAY DAILY ALIBI →" : "PLAY PERFECT STACK →"}</strong>
    </Link>
  );
}

export function HomeClient() {
  const [done, setDone] = useState(0);
  const [today, setToday] = useState("");
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const p = getLocalProgress();
      setToday(
        new Date(getGameDate() + "T12:00:00Z")
          .toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })
          .toUpperCase(),
      );
      setDone(Number(p.alibiSolved) + Number(p.stackSolved));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <main className="site-shell">
      <SiteHeader />
      <section className="home-hero container">
        <div className="home-hero-left">
          <span className="eyebrow">DAILY GAMES, BUILT FOR A QUICK WIN</span>
          <h1>
            Daily games worth
            <br />
            coming back for.
          </h1>
          <p className="lede">
            Solve a mystery, fit the impossible stack, and return tomorrow for a
            fresh challenge. Play free with ads or upgrade for an uninterrupted
            experience.
          </p>
          <div className="button-row">
            <a className="button primary" href="#games">
              Play today&apos;s games
            </a>
            <Link className="button secondary" href="/plus">
              Explore SKG Plus
            </Link>
          </div>
        </div>
        <aside className="today-panel">
          <span className="eyebrow inverse">TODAY {today && `• ${today}`}</span>
          <h2>2 new games</h2>
          <p>Finish both to keep your daily streak alive.</p>
          <div className="today-progress">
            <i className="alibi-color" />
            <i className="stack-color" />
            <div>
              <strong>{done} / 2</strong>
              <small>completed today</small>
            </div>
          </div>
        </aside>
      </section>

      <section id="games" className="container section">
        <div className="section-heading">
          <h2>Today&apos;s games</h2>
          <span>New challenges every day at midnight</span>
        </div>
        <div className="game-grid">
          <GameCard kind="alibi" />
          <GameCard kind="stack" />
        </div>
      </section>

      <section className="container free-row">
        <div className="panel free-panel">
          <span className="eyebrow">PLAY FREE</span>
          <div className="free-panel-main-text">
            <h3>Your games, streaks, and archive — supported by ads.</h3>
            <p>
              Ads appear between game sessions and in reserved spaces, never over
              the puzzle itself. Your progress stays saved either way.
            </p>
          </div>
          <div className="chips">
            <span>Daily games</span>
            <span>Basic stats</span>
            <span>7-day archive</span>
          </div>
        </div>
        <AdSlot />
      </section>

      <section className="container plus-banner">
        <div>
          <span className="eyebrow gold">SKG PLUS</span>
          <h2>Free to play. Better without ads.</h2>
          <p>
            Remove ads across every game and unlock a deeper archive, richer
            stats, and early access to new titles.
          </p>
          <div className="button-row">
            <Link className="button light" href="/plus">
              Try SKG Plus
            </Link>
            <a className="button light" href="#games">
              Keep playing free
            </a>
          </div>
        </div>
        <ul>
          <li>No display ads</li>
          <li>Full game archive</li>
          <li>Advanced streak & solve stats</li>
          <li>Early access to new games</li>
        </ul>
      </section>

      <footer className="site-footer">
        <span>SKG GAMES • A NEW CHALLENGE EVERY DAY</span>
        <span>About &nbsp; Privacy &nbsp; Terms &nbsp; Feedback</span>
      </footer>
    </main>
  );
}
