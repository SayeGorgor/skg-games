"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ThemeToggle } from "./theme-toggle";
import { AccountControls } from "./auth/account-controls";
import { useViewer } from "./auth/viewer-provider";

export function Brand({ className = "" }: { className?: string }) {
  // Satoshi's visible GAMES outlines span 0.75em, with a 1/64em
  // overshoot below the baseline. Match SKG and the mark at y=6…31.
  const gamesFontSize = 25 / 0.75;
  return (
    <Link className={`brand ${className}`} href="/" aria-label="SKG Games home">
      <svg
        className="skg-logo"
        viewBox="0 -4.5 227 46"
        width="227"
        height="46"
        role="img"
        aria-label="SKG Games"
      >
        {/* Three-dot mark */}
        <circle cx="14.5" cy="11.5" r="4.5" fill="var(--coral)" />
        <circle cx="7.5" cy="25.5" r="4.5" fill="var(--gold)" />
        <circle cx="21.5" cy="25.5" r="4.5" fill="var(--blue)" />

        {/* SKG */}
        <text
          x="31"
          y="31"
          fontFamily='"Array Wide", Arial, sans-serif'
          fontSize="40"
          fontWeight="400"
        >
          <tspan fill="var(--coral)">S</tspan>
          <tspan fill="var(--gold)">K</tspan>
          <tspan fill="var(--blue)">G</tspan>
        </text>

        {/* GAMES */}
        <text
          // Position each letter by its visible edges, matching SKG's tight gaps.
          x="110 137 159 187.5 208.5"
          y={31 - gamesFontSize / 64 + 0.13}
          fontFamily='"Satoshi Regular", Arial, sans-serif'
          fontSize={gamesFontSize}
          fontWeight="500"
          style={{ fontKerning: "none" }}
          fill="currentColor"
        >
          GAMES
        </text>
      </svg>
    </Link>
  );
}

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const { viewer, adsEnabled, streak } = useViewer();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function outside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className={`site-header ${compact ? "compact" : ""}`}>
        <div className="header-inner">
          <div className="header-left">
            <div
              className="header-menu"
              ref={menuRef}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  setMenuOpen(false);
              }}
            >
              <button
                ref={menuButton}
                className="header-menu-toggle"
                type="button"
                aria-label="Navigation menu"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <nav
                id={menuId}
                aria-label="Main navigation"
                hidden={!menuOpen}
                onClick={() => setMenuOpen(false)}
              >
                <Link href="/">Games</Link>
                <Link href="/#archive">Archive</Link>
                <Link href="/stats">Stats</Link>
                <div className="header-menu-mobile-actions">
                  {adsEnabled && !viewer.premium && (
                    <Link href="/plus/start">Subscribe</Link>
                  )}
                  {!adsEnabled && !viewer.authenticated && (
                    <AccountControls mode="sign-in" />
                  )}
                  <AccountControls />
                </div>
              </nav>
            </div>
            <Brand />
          </div>
          <span className="streak-pill header-streak">
            <svg
              className="streak-flame"
              width="22"
              height="26"
              viewBox="0 0 24 28"
              fill="none"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M13 1C14 6 20 8 18 14C20 13 21 11 21 10C23 14 24 17 22 21C20 25 16 27 12 27C6 27 2 23 2 18C2 13 5 10 7 8C7 12 9 13 9 13C8 8 10 4 13 1Z"
                fill="var(--coral)"
              />
              <path
                d="M13 11C14 15 19 17 18 21C17 24 15 25 12 25C9 25 6 23 7 20C7 18 9 16 10 15C10 18 11 19 11 19C11 16 11 13 13 11Z"
                fill="var(--gold)"
              />
            </svg>
            <span className="sr-only">{streak} day streak</span>
            <span className="streak-full" aria-hidden="true">
              {streak} DAY STREAK
            </span>
            <span className="streak-short" aria-hidden="true">
              {streak} days
            </span>
          </span>
          <div className="header-actions">
            <ThemeToggle />
            {adsEnabled && !viewer.premium && (
              <Link className="header-plus" href="/plus/start">
                <span className="plus-full">Go ad-free</span>
                <span className="plus-short">Plus</span>
              </Link>
            )}
            {!adsEnabled && !viewer.authenticated && (
              <AccountControls mode="sign-in" primary />
            )}
            <AccountControls />
          </div>
        </div>
      </header>
      <span id="main-content" className="sr-only" tabIndex={-1} />
    </>
  );
}
