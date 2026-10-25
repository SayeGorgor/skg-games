"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdSlot } from "@/components/ad-slot";
import { SiteHeader } from "@/components/site-header";
import { getAnonymousId, markLocalSolved } from "@/lib/client-progress";
import type { Cell, StackPiece, StackPuzzle } from "@/lib/games/perfect-stack";

type Placement = {
  pieceId: string;
  anchor: Cell;
  rotation: number;
  cells: Cell[];
};
const key = ([r, c]: Cell) => `${r}:${c}`;
function rotate(cells: Cell[]): Cell[] {
  const next = cells.map(([r, c]) => [c, -r] as Cell);
  const minR = Math.min(...next.map((x) => x[0])),
    minC = Math.min(...next.map((x) => x[1]));
  return next.map(([r, c]) => [r - minR, c - minC] as Cell);
}
function oriented(piece: StackPiece, rotation: number) {
  let cells = piece.cells;
  for (let i = 0; i < rotation % 4; i++) cells = rotate(cells);
  return cells;
}
function placeCells(piece: StackPiece, anchor: Cell, rotation: number) {
  return oriented(piece, rotation).map(
    ([r, c]) => [r + anchor[0], c + anchor[1]] as Cell,
  );
}

export function PerfectStackGame({ puzzle }: { puzzle: StackPuzzle }) {
  const [selected, setSelected] = useState(puzzle.pieces[0].id);
  const [rotations, setRotations] = useState<Record<string, number>>({});
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [moves, setMoves] = useState(0);
  const [message, setMessage] = useState(
    "Drag a piece onto the board. Tap a piece to rotate it.",
  );
  const [seconds, setSeconds] = useState(0);

  const started = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const fixedMap = useMemo(
    () => new Map(puzzle.fixed.map((x) => [key(x.cell), x.color])),
    [puzzle],
  );

  const placedMap = useMemo(() => {
    const m = new Map<string, string>();
    placements.forEach((p) => p.cells.forEach((c) => m.set(key(c), p.pieceId)));
    return m;
  }, [placements]);

  const target = new Set(puzzle.target.map(key));

  const remaining = puzzle.pieces.filter(
    (p) => !placements.some((x) => x.pieceId === p.id),
  );

  function begin() {
    started.current = true;
  }

  function tryPlace(pieceId: string, anchor: Cell) {
    begin();

    const piece = puzzle.pieces.find((p) => p.id === pieceId);
    if (!piece) return;

    const cells = placeCells(piece, anchor, rotations[pieceId] ?? 0);
    const invalid = cells.some(
      ([r, c]) =>
        r < 0 ||
        c < 0 ||
        r >= puzzle.size ||
        c >= puzzle.size ||
        fixedMap.has(key([r, c])) ||
        [...placements.filter((x) => x.pieceId !== pieceId)].some((p) =>
          p.cells.some((pc) => key(pc) === key([r, c])),
        ),
    );
    if (invalid) {
      setMessage("That placement overlaps the board or another piece.");
      return;
    }

    setPlacements((prev) => [
      ...prev.filter((p) => p.pieceId !== pieceId),
      { pieceId, anchor, rotation: rotations[pieceId] ?? 0, cells },
    ]);
    setMoves((m) => m + 1);
    setSelected(pieceId);
    setMessage("Placed. Keep going.");
  }

  function rotatePiece(pieceId: string) {
    begin();
    setRotations((r) => ({ ...r, [pieceId]: ((r[pieceId] ?? 0) + 1) % 4 }));
    setPlacements((p) => p.filter((x) => x.pieceId !== pieceId));
    setMoves((m) => m + 1);
    setSelected(pieceId);
  }

  function undo() {
    setPlacements((p) => p.slice(0, -1));
    setMoves((m) => Math.max(0, m - 1));
    setMessage("Last placement removed.");
  }

  function reset() {
    setPlacements([]);
    setRotations({});
    setMoves(0);
    setSeconds(0);
    setMessage("Board reset.");
  }

  async function check() {
    const occupied = new Set([...fixedMap.keys(), ...placedMap.keys()]);
    const solved =
      occupied.size === target.size &&
      [...target].every((x) => occupied.has(x)) &&
      placements.length === puzzle.pieces.length;
    setMessage(
      solved
        ? "Perfect stack — every target cell is filled."
        : "Not quite. Every highlighted target cell must be filled with no extras.",
    );
    if (solved) {
      markLocalSolved("stack");
      try {
        await fetch("/api/games/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            gameSlug: "perfect-stack",
            challengeNumber: puzzle.challengeNumber,
            solved: true,
            durationMs: seconds * 1000,
            moves,
            anonymousId: getAnonymousId(),
            result: { placements },
          }),
        });
      } catch {}
    }
  }
  
  const fmt = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <main className="site-shell">
      <SiteHeader />
      <section className="stack-page container">
        <div className="stack-intro">
          <div>
            <span className="streak-pill">
              DAILY PUZZLE #{puzzle.challengeNumber}
            </span>
            <span className="date-label">SUNDAY • OCT 25</span>
          </div>
          <h1>Perfect Stack</h1>
          <p className="lede">
            Fit every shape into the grid. Every piece belongs — the cleanest
            solve uses the fewest moves.
          </p>
        </div>
        <div className="stack-layout">
          <section className="stack-board-card">
            <div className="board-heading">
              <div>
                <span className="eyebrow blue">TODAY'S BOARD</span>
                <p>8 × 8 • {remaining.length} pieces left</p>
              </div>
              <span className="streak-pill">{moves} MOVES</span>
            </div>
            <div className="stack-grid">
              {Array.from({ length: puzzle.size * puzzle.size }, (_, i) => {
                const cell: [number, number] = [
                  Math.floor(i / puzzle.size),
                  i % puzzle.size,
                ];
                const k = key(cell);
                const fixed = fixedMap.get(k);
                const pid = placedMap.get(k);
                const piece = pid
                  ? puzzle.pieces.find((p) => p.id === pid)
                  : null;
                return (
                  <button
                    key={k}
                    aria-label={`Row ${cell[0] + 1}, column ${cell[1] + 1}`}
                    className={`stack-cell ${target.has(k) ? "target" : ""} ${fixed || piece?.color || ""}`}
                    onClick={() => selected && tryPlace(selected, cell)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      if (id) tryPlace(id, cell);
                    }}
                  />
                );
              })}
            </div>
            <p className="board-message">
              <i />
              {message}
            </p>
          </section>
          <aside className="stack-side">
            <div className="stat-row">
              <div>
                <strong>{fmt}</strong>
                <small>TIME</small>
              </div>
              <div>
                <strong>{moves}</strong>
                <small>MOVES</small>
              </div>
              <div>
                <strong>12</strong>
                <small>STREAK</small>
              </div>
            </div>
            <section className="piece-tray">
              <span className="eyebrow">PIECES LEFT</span>
              <div className="piece-grid">
                {puzzle.pieces.map((piece) => {
                  const placed = placements.some((p) => p.pieceId === piece.id);
                  const cells = oriented(piece, rotations[piece.id] ?? 0);
                  return (
                    <button
                      draggable={!placed}
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/plain", piece.id)
                      }
                      onClick={() => {
                        setSelected(piece.id);
                        if (!placed) rotatePiece(piece.id);
                      }}
                      key={piece.id}
                      disabled={placed}
                      className={`piece-card ${selected === piece.id && !placed ? "selected" : ""} ${placed ? "placed" : ""}`}
                    >
                      <PieceShape piece={piece} cells={cells} />
                      <small>
                        {placed
                          ? "Placed"
                          : piece.id === "green-o"
                            ? "Square"
                            : "Tap to rotate"}
                      </small>
                    </button>
                  );
                })}
              </div>
            </section>
            <div className="stack-controls">
              <button className="button primary" onClick={check}>
                Check solution
              </button>
              <button
                className="button secondary"
                onClick={undo}
                disabled={!placements.length}
              >
                Undo
              </button>
              <button className="button secondary" onClick={reset}>
                Reset
              </button>
            </div>
            <AdSlot />
          </aside>
        </div>
        <section className="panel how-stack">
          <h2>How to play</h2>
          <div>
            <p>
              <b>1</b>
              <strong>Place a piece</strong>
              <span>Drag on desktop, or select and tap a board cell.</span>
            </p>
            <p>
              <b>2</b>
              <strong>Rotate when needed</strong>
              <span>Tap an unplaced piece to rotate it.</span>
            </p>
            <p>
              <b>3</b>
              <strong>Fill every target cell</strong>
              <span>Finish with no overlap or extra cells.</span>
            </p>
          </div>
        </section>
      </section>
      <footer className="site-footer">
        <span>SKG GAMES • PERFECT STACK</span>
        <Link href="/">Back to games</Link>
      </footer>
    </main>
  );
}

function PieceShape({ piece, cells }: { piece: StackPiece; cells: Cell[] }) {
  const maxR = Math.max(...cells.map((c) => c[0])),
    maxC = Math.max(...cells.map((c) => c[1]));
  const set = new Set(cells.map(key));
  return (
    <span
      className="piece-shape"
      style={{
        gridTemplateColumns: `repeat(${maxC + 1}, 18px)`,
        gridTemplateRows: `repeat(${maxR + 1}, 18px)`,
      }}
    >
      {Array.from({ length: (maxR + 1) * (maxC + 1) }, (_, i) => {
        const c: [number, number] = [
          Math.floor(i / (maxC + 1)),
          i % (maxC + 1),
        ];
        return (
          <i key={i} className={set.has(key(c)) ? piece.color : "empty"} />
        );
      })}
    </span>
  );
}
