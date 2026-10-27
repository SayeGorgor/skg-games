"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import type { DailyStackProgress } from "@/lib/client-progress";
import {
  cellKey,
  getStackStars,
  type StackPlacement,
  type StackPuzzle,
} from "@/lib/games/perfect-stack";

export function StackVictory({
  puzzle,
  placements,
  moves,
  seconds,
  progress,
  stars: savedStars,
}: {
  puzzle: StackPuzzle;
  placements: StackPlacement[];
  moves: number;
  seconds: number;
  progress: DailyStackProgress | null;
  stars?: 1 | 2 | 3;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const colors = new Map(puzzle.pieces.map((piece) => [piece.id, piece.color]));
  const board = new Map(
    placements.flatMap((placement) =>
      placement.cells.map(
        (cell) => [cellKey(cell), colors.get(placement.pieceId)] as const,
      ),
    ),
  );
  const stars = savedStars ?? getStackStars(moves, puzzle.pieceCount);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const extra = Math.max(0, moves - puzzle.optimalPlacements);
  const difficulties = ["small", "medium", "hard"] as const;
  const next =
    difficulties.find((difficulty) => !progress?.difficulties[difficulty]) ??
    difficulties[
      (difficulties.indexOf(puzzle.difficulty) + 1) % difficulties.length
    ];

  return (
    <>
      <button
        ref={trigger}
        className="button secondary stack-victory-reopen"
        onClick={() => dialog.current?.showModal()}
        aria-haspopup="dialog"
      >
        View results
      </button>
      <dialog
        ref={dialog}
        className="stack-help-dialog stack-victory-dialog"
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
        <div className="stack-help-content stack-victory-content">
          <header className="stack-help-heading">
            <span className="eyebrow blue">
              {puzzle.mode === "daily"
                ? `DAILY #${puzzle.challengeNumber}`
                : "PRACTICE"}{" "}
              &middot; {puzzle.difficulty.toUpperCase()}
            </span>
            <button
              className="stack-help-close"
              aria-label="Close victory popup"
              onClick={() => dialog.current?.close()}
              autoFocus
            >
              &times;
            </button>
          </header>
          <div className="stack-victory-heading">
            <span
              className="stack-victory-stars"
              role="img"
              aria-label={`${stars} out of 3 stars`}
            >
              {"\u2605".repeat(stars)}
              <span aria-hidden="true">{"\u2606".repeat(3 - stars)}</span>
            </span>
            <h2 id={titleId}>Perfect stack!</h2>
            <p id={descriptionId}>Every piece placed. Every square filled.</p>
          </div>
          <svg
            className="stack-victory-board"
            viewBox={`0 0 ${puzzle.cols * 28 + 8} ${puzzle.rows * 28 + 8}`}
            role="img"
            aria-label={`Your completed ${puzzle.rows} by ${puzzle.cols} board`}
          >
            {Array.from({ length: puzzle.rows * puzzle.cols }, (_, i) => {
              const row = Math.floor(i / puzzle.cols),
                col = i % puzzle.cols;
              const color = board.get(cellKey([row, col]));
              return (
                <rect
                  key={i}
                  x={col * 28 + 6}
                  y={row * 28 + 6}
                  width="24"
                  height="24"
                  rx="5"
                  fill={color ? `var(--${color})` : "var(--bg-surface)"}
                  stroke="var(--border)"
                  strokeWidth=".5"
                />
              );
            })}
          </svg>
          <dl className="stack-victory-stats">
            <div>
              <dt>Time</dt>
              <dd>{time}</dd>
            </div>
            <div>
              <dt>Moves</dt>
              <dd>{moves}</dd>
            </div>
            <div>
              <dt>Optimal</dt>
              <dd>{puzzle.optimalPlacements}</dd>
            </div>
          </dl>
          <p className="stack-victory-extra">
            {extra === 0
              ? "A perfect placement run. Nicely done."
              : `${extra} extra ${extra === 1 ? "move" : "moves"}. Every completed board is a win.`}
          </p>
          {puzzle.mode === "daily" && (
            <div className="stack-victory-daily">
              <span className="eyebrow">TODAY&apos;S BOARDS</span>
              <ul>
                {difficulties.map((difficulty) => (
                  <li key={difficulty}>
                    <span>{difficulty}</span>
                    <span
                      aria-label={
                        progress?.difficulties[difficulty]
                          ? "Solved"
                          : "Not solved"
                      }
                    >
                      {progress?.difficulties[difficulty] ? "\u2713" : "\u25cb"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="stack-victory-actions">
            {puzzle.mode === "practice" ? (
              <button
                className="button primary"
                onClick={() => {
                  router.push(
                    `?mode=practice&difficulty=${puzzle.difficulty}&seed=${crypto.randomUUID().slice(0, 8)}`,
                  );
                }}
              >
                New puzzle
              </button>
            ) : (
              <Link
                className="button primary"
                href={`?mode=daily&difficulty=${next}`}
              >
                Try {next}
              </Link>
            )}
            <button
              className="button secondary"
              onClick={() => dialog.current?.close()}
            >
              Back to board
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
