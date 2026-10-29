"use client";

import { useId, useRef } from "react";

const demoBoard = [
  "blue",
  "blue",
  "blue",
  "gold",
  "gold",
  "blue",
  "green",
  "blue",
  "gold",
  "gold",
  "green",
  "green",
  "green",
  "gold",
  "coral",
  "violet",
  "violet",
  "green",
  "coral",
  "coral",
  "violet",
  "violet",
  "violet",
  "coral",
  "coral",
];
const steps = [
  {
    title: "Pick a piece",
    text: "Drag a shape from the tray, or select it and tap a square on the board.",
  },
  {
    title: "Rotate and place",
    text: "Tap an unplaced piece to rotate it. Pieces can turn, but cannot flip.",
  },
  {
    title: "Fill every square",
    text: "Use every piece with no overlaps or gaps. Pick up placed pieces to move them.",
  },
  {
    title: "Chase a perfect solve",
    text: "Place each piece only once for three stars. Rotations and invalid drops cost no moves.",
  },
];

function GuidePicture({ step }: { step: number }) {
  const shape = [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 2],
  ];
  return (
    <svg
      className="stack-guide-picture"
      viewBox="0 0 280 132"
      aria-hidden="true"
    >
      {step === 1 ? (
        <>
          <g transform="translate(44 36)">
            {shape.map(([r, c]) => (
              <rect
                key={`${r}:${c}`}
                x={c * 21}
                y={r * 21}
                width="18"
                height="18"
                rx="4"
                fill="var(--blue)"
              />
            ))}
          </g>
          <path
            d="M122 63 Q140 44 158 63 M150 53 L158 63 L145 65"
            fill="none"
            stroke="var(--text-2)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <g transform="translate(186 30)">
            {shape.map(([r, c]) => (
              <rect
                key={`${r}:${c}`}
                x={(1 - r) * 21}
                y={c * 21}
                width="18"
                height="18"
                rx="4"
                fill="var(--blue)"
              />
            ))}
          </g>
        </>
      ) : (
        <>
          <rect
            x="91"
            y="9"
            width="114"
            height="114"
            rx="12"
            fill="var(--bg-raised)"
          />
          {demoBoard.map((color, i) => {
            const filled = step === 3 || (step === 2 && color !== "blue");
            return (
              <rect
                key={i}
                x={98 + (i % 5) * 21}
                y={16 + Math.floor(i / 5) * 21}
                width="18"
                height="18"
                rx="4"
                fill={filled ? `var(--${color})` : "var(--bg-surface)"}
                stroke="var(--border)"
                strokeWidth=".6"
              />
            );
          })}
          {step !== 3 && (
            <g
              transform={step === 0 ? "translate(14 43)" : "translate(98 16)"}
              opacity={step === 2 ? 0.55 : 1}
            >
              {shape.map(([r, c]) => (
                <rect
                  key={`${r}:${c}`}
                  x={c * 21}
                  y={r * 21}
                  width="18"
                  height="18"
                  rx="4"
                  fill="var(--blue)"
                />
              ))}
            </g>
          )}
          {step === 0 && (
            <path
              d="M54 99 Q74 118 91 101 M82 100 L91 101 L90 110"
              fill="none"
              stroke="var(--text-2)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {step === 3 && (
            <text
              x="232"
              y="79"
              textAnchor="middle"
              fontSize="25"
              fill="var(--gold)"
            >
              {"\u2605"}
            </text>
          )}
        </>
      )}
    </svg>
  );
}

export function StackHowToPlay() {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  return (
    <>
      <button
        className="button secondary stack-help-button"
        onClick={() => dialog.current?.showModal()}
        aria-haspopup="dialog"
        aria-label="How to play"
      >
        <span aria-hidden="true">?</span>
        <span className="stack-help-label">How to play</span>
      </button>
      <dialog
        ref={dialog}
        className="stack-help-dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
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
              <span className="eyebrow blue">PERFECT STACK</span>
              <h2 id={titleId}>How to play</h2>
            </div>
            <button
              className="stack-help-close"
              onClick={() => dialog.current?.close()}
              aria-label="Close instructions"
              autoFocus
            >
              &times;
            </button>
          </header>
          <p id={descriptionId} className="stack-help-description">
            Use every piece. Fill every square.
          </p>
          <ol className="stack-guide-steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <div className="stack-guide-art">
                  <GuidePicture step={index} />
                </div>
                <h3>
                  <span>{index + 1}</span>
                  {step.title}
                </h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
          <footer className="stack-help-footer">
            <span>Small, Medium, or Hard. The goal stays the same.</span>
            <button
              className="button primary"
              onClick={() => dialog.current?.close()}
            >
              Got it, let&apos;s play
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
