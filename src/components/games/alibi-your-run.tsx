"use client";

import { useId, useRef } from "react";

export function AlibiRunStats() {
  return (
    <>
      <strong>14 days</strong>
      <div>
        <span>
          11<small>solved</small>
        </span>
        <span>
          78%<small>accuracy</small>
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
