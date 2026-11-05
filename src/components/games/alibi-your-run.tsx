"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useViewer } from "@/components/auth/viewer-provider";
import type { summarize } from "@/lib/results/shared";

type Run = ReturnType<typeof summarize>["byGame"][number];

export function AlibiRunStats() {
  const { viewer } = useViewer();
  const scope = viewer.authenticated ? viewer.accountKey : null;
  const [state, setState] = useState<{
    scope: string;
    run?: Run;
    error?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!scope) return;
    const controller = new AbortController();
    let version = 0;
    const load = async () => {
      const request = ++version;
      try {
        const response = await fetch("/api/stats?game=daily-alibi", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Stats unavailable");
        const data: {
          accountKey: string;
          summary: ReturnType<typeof summarize>;
        } = await response.json();
        if (data.accountKey !== scope) throw new Error("Account changed");
        const run = data.summary.byGame.find(
          (game) => game.slug === "daily-alibi",
        );
        if (!run) throw new Error("Missing stats");
        if (!controller.signal.aborted && request === version)
          setState({ scope, run });
      } catch {
        if (!controller.signal.aborted && request === version)
          setState({ scope, error: true });
      }
    };
    const frame = requestAnimationFrame(() => void load());
    window.addEventListener("skg-results-synced", load);
    window.addEventListener("focus", load);
    return () => {
      cancelAnimationFrame(frame);
      controller.abort();
      window.removeEventListener("skg-results-synced", load);
      window.removeEventListener("focus", load);
    };
  }, [scope]);

  if (!viewer.authenticated)
    return <p className="alibi-run-message">Sign in to track your stats</p>;
  const current = state?.scope === scope ? state : null;
  if (!current?.run)
    return (
      <p className="alibi-run-message" role="status">
        {current?.error
          ? "Your stats are temporarily unavailable. Please try again shortly."
          : "Loading your stats…"}
      </p>
    );
  const { run } = current;
  const accuracy = run.played ? Math.round((run.won / run.played) * 100) : 0;
  return (
    <>
      <strong aria-label={`${run.streak.current} day streak`}>
        {run.streak.current} {run.streak.current === 1 ? "day" : "days"}
      </strong>
      <div>
        <span>
          {run.won}
          <small>solved</small>
        </span>
        <span>
          {accuracy}%<small>accuracy</small>
        </span>
      </div>
    </>
  );
}

export function AlibiYourRun() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  return (
    <>
      <button
        ref={trigger}
        className="alibi-help-button alibi-run-button"
        aria-label="Your run"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12h6v9H3zM9 5h6v16H9zM15 9h6v12h-6z" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        className="stack-help-dialog alibi-result-dialog alibi-run-dialog"
        aria-labelledby={titleId}
        onClose={() => trigger.current?.focus()}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            dialog.current?.close();
        }}
      >
        <div className="stack-help-content">
          <header className="stack-help-heading">
            <div>
              <span className="eyebrow gold">DAILY ALIBI</span>
              <h2 id={titleId}>Your run</h2>
            </div>
            <button
              className="stack-help-close"
              aria-label="Close your run"
              onClick={() => dialog.current?.close()}
              autoFocus
            >
              &times;
            </button>
          </header>
          <div className="alibi-stat">
            <AlibiRunStats />
          </div>
        </div>
      </dialog>
    </>
  );
}
