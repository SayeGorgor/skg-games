"use client";

import { useId, useRef } from "react";

const steps = [
  {
    title: "Open the case",
    text: "Read the case brief and objective. Establish what happened, when it happened, and what your accusation needs to explain.",
    icon: "M8 5h8l3 3v15H5V5h3m0 0V3h8v4H8V5m1 7h6m-6 4h6",
  },
  {
    title: "Follow the evidence",
    text: "Compare every clue with the suspects’ statements. Check times, locations, and access. Look for a story that cannot fit the facts, rather than a person who simply seems suspicious.",
    icon: "M17 17l6 6M20 11a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM7 11h8m-4-4v8",
  },
  {
    title: "Choose your suspect",
    text: "Tap a suspect’s card to select them. You can change your selection and reread the evidence as often as you like before submitting.",
    icon: "M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM5 23v-3a8 8 0 0 1 16 0v3M9 20l3 3 5-6",
  },
  {
    title: "Make your accusation",
    text: "When the evidence adds up, press Make accusation. You get one final accusation for today’s case. Read the explanation to see how your choice fits the clues, then return for a new case tomorrow.",
    icon: "M7 3h12v21H7V3m4 5h4m-4 4h4m-5 6 2 2 4-4",
  },
];

export function AlibiHowToPlay() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  return (
    <>
      <button
        ref={trigger}
        className="alibi-help-button"
        aria-label="How to play Daily Alibi"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        ?
      </button>
      <dialog
        ref={dialog}
        className="stack-help-dialog alibi-result-dialog alibi-help-dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
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
              <span className="eyebrow gold">DAILY ALIBI · FIELD GUIDE</span>
              <h2 id={titleId}>How to play</h2>
            </div>
            <button
              className="stack-help-close"
              aria-label="Close instructions"
              onClick={() => dialog.current?.close()}
              autoFocus
            >
              &times;
            </button>
          </header>
          <p id={descriptionId} className="alibi-help-intro">
            One case. Four suspects. One story that doesn’t hold up.
          </p>
          <ol className="alibi-guide-steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <div className="alibi-guide-icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 28 28"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={step.icon} />
                  </svg>
                </div>
                <div>
                  <span className="eyebrow gold">STEP 0{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <aside className="alibi-guide-tip">
            <strong>Think like a detective</strong>
            <p>
              A claim says “I left at 8:00.” A record places that person inside
              at 8:15. That contradiction is a lead. Always check it against the
              rest of the evidence.
            </p>
            <small>
              Illustrative example only — unrelated to today’s case.
            </small>
          </aside>
          <footer className="alibi-help-footer">
            <span>Selecting is reversible. Accusing is final.</span>
            <button
              className="button alibi-button"
              onClick={() => dialog.current?.close()}
            >
              Let’s investigate
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
