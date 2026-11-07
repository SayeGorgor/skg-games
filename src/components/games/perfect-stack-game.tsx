"use client";

import Link from "next/link";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { CSSProperties, PointerEvent } from "react";
import { AdSlot } from "@/components/ad-slot";
import {
  readStackHandoff,
  saveStackHandoff,
  clearStackHandoff,
} from "@/lib/auth/game-handoff";
import { SiteHeader } from "@/components/site-header";
import { useViewer } from "@/components/auth/viewer-provider";
import { useStackAccountProgress } from "./use-stack-account-progress";
import {
  matchesAccountCompletion,
  stackCompletionIdentity,
  type AccountStackProgress,
} from "@/lib/games/perfect-stack/completion";
import { newResult, queueResult, setResultActor } from "@/lib/results/local";
import { getGameDate } from "@/lib/game-date";
import { StackHowToPlay } from "@/components/games/stack-how-to-play";
import { StackVictory } from "@/components/games/stack-victory";
import "./perfect-stack-layout.css";
import {
  markStackDailySolved,
  getStackDailyProgress,
  getRestoredDailyStackState,
} from "@/lib/client-progress";
import {
  oriented,
  getDragAnchor,
  getStackDragCell,
  placeCells,
  validPlacement,
  isStackSolved,
  getStackStars,
  STACK_DIFFICULTIES,
  type Cell,
  type StackPiece,
  type StackPuzzle,
  type StackDifficulty,
  type StackPlacement,
} from "@/lib/games/perfect-stack";

type Placement = StackPlacement;
type DragState = {
  pieceId: string;
  pointerId: number;
  originX: number;
  originY: number;
  clientX: number;
  clientY: number;
  active: boolean;
  anchor: Cell | null;
  pieceAnchor: Cell;
  metrics: DragMetrics;
  cells: Cell[];
  valid: boolean;
};
type DragMetrics = {
  cellWidth: number;
  cellHeight: number;
  columnGap: number;
  rowGap: number;
};
const DRAG_THRESHOLD = 6;
const key = ([r, c]: Cell) => `${r}:${c}`;
const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export function PerfectStackGame({ puzzle }: { puzzle: StackPuzzle }) {
  const { viewer } = useViewer();
  const accountScope =
    viewer.authenticated && puzzle.mode === "daily" ? viewer.accountKey : null;
  const account = useStackAccountProgress(
    accountScope,
    puzzle.mode === "daily" ? puzzle.challengeDate : null,
  );
  const [freshCompletion, setFreshCompletion] = useState<{
    scope: string | null | undefined;
    seed: string;
    identity: string;
  } | null>(null);
  // Local storage cannot be read during SSR. Mount the keyed session only once
  // client storage is available, so a restored board's first render is solved.
  const ready = useSyncExternalStore(
    subscribeToHydration,
    clientReady,
    serverReady,
  );
  const completion = account.state?.data?.difficulties[puzzle.difficulty];
  const preserveFreshSession =
    completion &&
    freshCompletion &&
    freshCompletion.scope === accountScope &&
    freshCompletion.seed === puzzle.seed &&
    freshCompletion.identity === stackCompletionIdentity(completion);
  const waiting =
    viewer.authenticated &&
    puzzle.mode === "daily" &&
    (!accountScope || !account.state?.data);
  const failed =
    viewer.authenticated &&
    puzzle.mode === "daily" &&
    account.state?.error &&
    !matchesAccountCompletion(puzzle, completion);
  if (!ready || waiting || failed)
    return (
      <main className="site-shell">
        <SiteHeader />
        <section className="stack-page container" aria-busy="true">
          <h1>Perfect Stack</h1>
          <p role="status">{account.state?.error ?? "Loading your board..."}</p>
          {account.state?.error && (
            <button className="button secondary" onClick={account.retry}>
              Retry saved board
            </button>
          )}
        </section>
      </main>
    );
  return (
    <PerfectStackSession
      key={`${accountScope ?? "guest"}:${puzzle.mode}:${puzzle.challengeDate}:${puzzle.difficulty}:${puzzle.seed}:${completion && !preserveFreshSession ? stackCompletionIdentity(completion) : "open"}`}
      puzzle={puzzle}
      accountScope={accountScope}
      accountProgress={account.state?.data}
      syncError={account.state?.error}
      onRetry={account.retry}
      onCompleted={(result) =>
        setFreshCompletion({
          scope: accountScope,
          seed: puzzle.seed,
          identity: stackCompletionIdentity(result),
        })
      }
    />
  );
}

function PerfectStackSession({
  puzzle,
  accountScope,
  accountProgress,
  onCompleted,
  syncError,
  onRetry,
}: {
  puzzle: StackPuzzle;
  accountScope?: string | null;
  accountProgress?: AccountStackProgress;
  onCompleted: (result: {
    moves: number;
    durationMs: number;
    stars: 1 | 2 | 3;
    placements: Placement[];
  }) => void;
  syncError?: string;
  onRetry: () => void;
}) {
  const [initial] = useState(() => {
    const progress = getStackDailyProgress(
      puzzle.challengeDate ?? undefined,
      accountScope,
    );
    if (accountProgress)
      for (const difficulty of ["small", "medium", "hard"] as const) {
        const result = accountProgress.difficulties[difficulty];
        if (!result) continue;
        progress.difficulties[difficulty] = {
          solved: true,
          stars: result.stars ?? 1,
          moves: result.moves ?? 0,
          durationMs: result.durationMs ?? 0,
          puzzleSeed: result.puzzleSeed,
          ...(result.placements ? { placements: result.placements } : {}),
          ...(result.completedAt ? { completedAt: result.completedAt } : {}),
        };
      }
    const restored = getRestoredDailyStackState(puzzle, progress);
    const remote = accountProgress?.difficulties[puzzle.difficulty];
    const legacy = Boolean(remote && !matchesAccountCompletion(puzzle, remote));
    if (puzzle.mode === "daily" && !restored && !legacy) {
      // Keep historical metadata in storage, but don't present a legacy/stale
      // record as a locked completion for the active puzzle.
      delete progress.difficulties[puzzle.difficulty];
    }
    const handoff =
      restored || legacy ? null : readStackHandoff(puzzle, accountScope);
    return { progress, restored, handoff, legacy, remote };
  });
  const [solved, setSolved] = useState(
    initial.restored !== null || initial.legacy,
  );
  const [progress, setProgress] = useState(initial.progress);
  const completedRef = useRef(initial.restored !== null || initial.legacy);
  const [selected, setSelected] = useState(
    initial.restored ? "" : (initial.handoff?.selected ?? puzzle.pieces[0].id),
  );
  const [rotations, setRotations] = useState<Record<string, number>>(
    () =>
      initial.handoff?.rotations ??
      Object.fromEntries(
        initial.restored?.placements.map((p) => [p.pieceId, p.rotation]) ?? [],
      ),
  );
  const [placements, setPlacements] = useState<Placement[]>(
    initial.restored?.placements ?? initial.handoff?.placements ?? [],
  );
  const [moves, setMoves] = useState(
    initial.restored?.moves ?? initial.handoff?.moves ?? 0,
  );
  const [message, setMessage] = useState(
    initial.restored
      ? "Perfect stack. Every square is filled."
      : "Drag a piece onto the board. Tap a piece to rotate it.",
  );
  const [seconds, setSeconds] = useState(
    initial.handoff?.seconds ??
      Math.floor((initial.restored?.durationMs ?? 0) / 1000),
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const pieceGridRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The account lookup confirmed no result, but this account has a valid
    // local final board (for example a previously failed upload). Reuse the
    // normal idempotent queue, preserving the original completion timestamp.
    if (
      !accountScope ||
      puzzle.mode !== "daily" ||
      initial.remote ||
      !initial.restored
    )
      return;
    setResultActor(accountScope);
    queueResult({
      ...newResult({
        gameSlug: "perfect-stack",
        mode: "daily",
        difficulty: puzzle.difficulty,
        challengeDate: puzzle.challengeDate,
        challengeNumber: puzzle.challengeNumber,
        puzzleSeed: puzzle.seed,
        solved: true,
        moves: initial.restored.moves,
        durationMs: initial.restored.durationMs,
        result: {
          placements: initial.restored.placements,
          stars: initial.restored.stars,
        },
      }),
      completedAt: initial.restored.completedAt ?? null,
    });
  }, [accountScope, puzzle, initial]);

  useEffect(() => {
    const primary = primaryRef.current;
    const header = primary?.querySelector(".site-header");
    if (!primary || !header) return;
    const measure = () =>
      primary.style.setProperty(
        "--stack-site-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    measure();
    return () => observer.disconnect();
  }, []);

  const started = useRef(false);
  const saveForAuth = useEffectEvent(() => {
    if (!solved)
      saveStackHandoff(
        puzzle,
        {
          placements,
          rotations,
          moves,
          seconds,
          selected,
        },
        accountScope,
      );
  });
  useEffect(() => {
    clearStackHandoff(puzzle, accountScope);
    window.addEventListener("skg-auth-leaving", saveForAuth);
    return () => window.removeEventListener("skg-auth-leaving", saveForAuth);
  }, [puzzle, accountScope]);

  useEffect(() => {
    if (solved) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [solved]);

  const placedMap = useMemo(() => {
    const m = new Map<string, string>();
    placements.forEach((p) => p.cells.forEach((c) => m.set(key(c), p.pieceId)));
    return m;
  }, [placements]);

  const remaining = puzzle.pieces.filter(
    (p) => !placements.some((x) => x.pieceId === p.id),
  );

  function begin() {
    started.current = true;
  }

  function isPlacementValid(pieceId: string, cells: Cell[]) {
    return validPlacement(puzzle, cells, placements, pieceId);
  }

  function tryPlace(pieceId: string, anchor: Cell, pieceAnchor?: Cell) {
    if (solved) return;
    begin();

    const piece = puzzle.pieces.find((p) => p.id === pieceId);
    if (!piece) return;

    const cells = placeCells(
      piece,
      anchor,
      rotations[pieceId] ?? 0,
      pieceAnchor,
    );
    if (!isPlacementValid(pieceId, cells)) {
      setMessage("That placement overlaps the board or another piece.");
      return;
    }

    const next = [
      ...placements.filter((p) => p.pieceId !== pieceId),
      { pieceId, anchor, rotation: rotations[pieceId] ?? 0, cells },
    ];
    setPlacements(next);
    if (isStackSolved(puzzle, next)) void complete(next, moves + 1);
    setMoves((m) => m + 1);
    setSelected(pieceId);
    setMessage(
      isStackSolved(puzzle, next)
        ? "Perfect stack. Every square is filled."
        : "Placed. Keep going.",
    );
  }

  function updateDrag(next: DragState | null) {
    dragRef.current = next;
    setDrag(next);
  }

  function getBoardDragMetrics(): DragMetrics | null {
    const grid = boardRef.current;
    const cell = grid?.querySelector<HTMLElement>('[data-stack-cell="true"]');
    if (!grid || !cell) return null;
    const rect = cell.getBoundingClientRect();
    const styles = getComputedStyle(grid);
    return {
      cellWidth: rect.width,
      cellHeight: rect.height,
      columnGap: parseFloat(styles.columnGap) || 0,
      rowGap: parseFloat(styles.rowGap) || 0,
    };
  }

  function getBoardCell(
    clientX: number,
    clientY: number,
    metrics: DragMetrics,
  ) {
    const firstCell = boardRef.current
      ?.querySelector<HTMLElement>('[data-stack-cell="true"]')
      ?.getBoundingClientRect();
    return firstCell
      ? getStackDragCell(clientX, clientY, {
          ...metrics,
          left: firstCell.left,
          top: firstCell.top,
          rows: puzzle.rows,
          cols: puzzle.cols,
        })
      : null;
  }

  function projectDrag(current: DragState, clientX: number, clientY: number) {
    const active =
      current.active ||
      Math.hypot(clientX - current.originX, clientY - current.originY) >=
        DRAG_THRESHOLD;
    const anchor = active
      ? getBoardCell(clientX, clientY, current.metrics)
      : null;
    const piece = puzzle.pieces.find((p) => p.id === current.pieceId)!;
    const cells = anchor
      ? placeCells(piece, anchor, rotations[piece.id] ?? 0, current.pieceAnchor)
      : [];
    return {
      ...current,
      clientX,
      clientY,
      active,
      anchor,
      cells,
      valid: !!anchor && isPlacementValid(piece.id, cells),
    };
  }

  function startDrag(
    event: PointerEvent<HTMLElement>,
    pieceId: string,
    boardCell?: Cell,
  ) {
    if (solved || !event.isPrimary || event.button !== 0 || dragRef.current)
      return;
    const metrics = getBoardDragMetrics();
    const piece = puzzle.pieces.find((p) => p.id === pieceId);
    if (!metrics || !piece) return;
    // Keep the browser's native selection/drag gesture from cancelling ours.
    event.preventDefault();
    suppressClickRef.current = false;
    setSelected(pieceId);
    const captureTarget = boardCell
      ? ((event.target as Element).closest('[data-stack-cell="true"]') ??
        event.currentTarget)
      : event.currentTarget;
    captureTarget.setPointerCapture(event.pointerId);
    updateDrag({
      pieceId,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      active: false,
      anchor: null,
      pieceAnchor:
        boardCell && placements.find((p) => p.pieceId === pieceId)
          ? (() => {
              const placement = placements.find((p) => p.pieceId === pieceId)!;
              const minR = Math.min(...placement.cells.map((c) => c[0])),
                minC = Math.min(...placement.cells.map((c) => c[1]));
              return [boardCell[0] - minR, boardCell[1] - minC] as Cell;
            })()
          : getDragAnchor(oriented(piece, rotations[pieceId] ?? 0)),
      metrics,
      cells: [],
      valid: false,
    });
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    updateDrag(projectDrag(current, event.clientX, event.clientY));
  }

  function endDrag(event: PointerEvent<HTMLElement>, cancelled = false) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // Hit-test again on release, including any scrolling since the last move.
    const final = cancelled
      ? current
      : projectDrag(current, event.clientX, event.clientY);
    suppressClickRef.current = cancelled || final.active;
    updateDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (cancelled || !final.active) return;
    if (final.anchor && final.valid)
      tryPlace(final.pieceId, final.anchor, final.pieceAnchor);
    else setMessage("That placement overlaps the board or another piece.");
  }

  const scrollDrag = useEffectEvent((elapsed: number) => {
    const current = dragRef.current;
    const tray = pieceGridRef.current;
    if (!current?.active || !tray) return;
    const rect = tray.getBoundingClientRect();
    if (
      current.clientX < rect.left ||
      current.clientX > rect.right ||
      current.clientY < rect.top ||
      current.clientY > rect.bottom
    )
      return;
    const edge = Math.min(40, rect.height / 3);
    const direction =
      current.clientY < rect.top + edge
        ? -1
        : current.clientY > rect.bottom - edge
          ? 1
          : 0;
    if (!direction) return;
    const before = tray.scrollTop;
    // Keep scrolling at the same speed on high refresh rate screens.
    tray.scrollBy({
      top: (direction * 360 * elapsed) / 1000,
      behavior: "instant",
    });
    if (tray.scrollTop !== before) {
      updateDrag(projectDrag(current, current.clientX, current.clientY));
    }
  });

  const refreshDragMetrics = useEffectEvent(() => {
    const current = dragRef.current;
    const metrics = getBoardDragMetrics();
    if (!current || !metrics) return;
    updateDrag(
      projectDrag({ ...current, metrics }, current.clientX, current.clientY),
    );
  });

  const hasDrag = drag !== null;
  useEffect(() => {
    const grid = boardRef.current;
    if (!hasDrag || !grid) return;
    const observer = new ResizeObserver(() => refreshDragMetrics());
    observer.observe(grid);
    const cell = grid.querySelector('[data-stack-cell="true"]');
    if (cell) observer.observe(cell);
    const onResize = () => refreshDragMetrics();
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [hasDrag]);

  const dragging = !!drag?.active;
  useEffect(() => {
    if (!dragging) return;
    let frame: number;
    let previous = performance.now();
    function tick(now: number) {
      scrollDrag(Math.min(now - previous, 32));
      previous = now;
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dragging]);

  const draggingPiece = drag
    ? puzzle.pieces.find((p) => p.id === drag.pieceId)
    : null;
  const dragPreview = useMemo(
    () => new Set(drag?.active ? drag.cells.map(key) : []),
    [drag],
  );
  const boardMessage = !drag?.active
    ? message
    : !drag.anchor
      ? "Drag the piece onto the board."
      : drag.valid
        ? "Release to place the piece."
        : "That position overlaps another shape or leaves the board.";

  function rotatePiece(pieceId: string) {
    if (solved) return;
    begin();
    setRotations((r) => ({ ...r, [pieceId]: ((r[pieceId] ?? 0) + 1) % 4 }));
    setPlacements((p) => p.filter((x) => x.pieceId !== pieceId));
    setSelected(pieceId);
  }

  function undo() {
    if (solved) return;
    updateDrag(null);
    setPlacements((p) => p.slice(0, -1));

    setMessage("Last placement removed.");
  }

  function clearBoard() {
    if (solved) return;
    updateDrag(null);
    setPlacements([]);
    setMessage("Board cleared.");
  }

  async function complete(next: Placement[], finalMoves: number) {
    if (completedRef.current) return;
    completedRef.current = true;
    setSolved(true);
    setMessage("Perfect stack · every square is filled.");
    const stars = getStackStars(finalMoves, puzzle.pieceCount);
    onCompleted({
      moves: finalMoves,
      durationMs: seconds * 1000,
      stars,
      placements: next,
    });
    if (puzzle.mode === "daily" && puzzle.challengeDate)
      setProgress(
        markStackDailySolved(
          puzzle.challengeDate,
          puzzle.difficulty,
          {
            solved: true,
            stars,
            moves: finalMoves,
            durationMs: seconds * 1000,
            puzzleSeed: puzzle.seed,
            placements: next,
            completedAt: new Date().toISOString(),
          },
          puzzle,
          accountScope,
        ),
      );
    queueResult(
      newResult({
        gameSlug: "perfect-stack",
        mode: puzzle.mode,
        difficulty: puzzle.difficulty,
        challengeDate: puzzle.challengeDate,
        challengeNumber: puzzle.challengeNumber,
        puzzleSeed: puzzle.seed,
        solved: true,
        durationMs: seconds * 1000,
        moves: finalMoves,
        result: { placements: next, stars },
      }),
    );
  }

  function check() {
    if (isStackSolved(puzzle, placements)) void complete(placements, moves);
    else
      setMessage(
        "Use every piece. Fill every square with no overlaps or gaps.",
      );
  }
  const urlFor = (mode: string, difficulty: StackDifficulty) =>
    `?mode=${mode}&difficulty=${difficulty}`;
  const fmt = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <main className="site-shell stack-game-shell">
      <div className="stack-primary" ref={primaryRef}>
        <SiteHeader />
        <section className="stack-page container">
          <div className="stack-heading">
            {syncError && (
              <p role="status">
                Showing your cached completed board. {syncError}{" "}
                <button className="button secondary" onClick={onRetry}>
                  Retry saved board
                </button>
              </p>
            )}
            <div className="stack-intro">
              <div>
                <span className="stack-puzzle-pill">
                  {puzzle.mode === "daily"
                    ? `PUZZLE #${puzzle.challengeNumber}`
                    : "PRACTICE"}
                </span>
                <span className="date-label">
                  {new Date(
                    (puzzle.challengeDate ?? getGameDate()) + "T12:00:00Z",
                  )
                    .toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })
                    .toUpperCase()}
                </span>
              </div>
              {puzzle.mode === "practice" && (
                <span className="stack-practice-seed">Seed: {puzzle.seed}</span>
              )}
              <div className="stack-title-row">
                <h1>Perfect Stack</h1>
                <StackHowToPlay />
              </div>
              <p className="lede">Use every piece. Fill every square.</p>
            </div>
            {solved && !initial.legacy && (
              <StackVictory
                puzzle={puzzle}
                placements={placements}
                moves={moves}
                seconds={seconds}
                progress={progress}
                stars={initial.restored?.stars}
                autoOpen={!initial.remote}
              />
            )}
            <div className="stack-options-panel">
              <nav className="button-row" aria-label="Game mode">
                {(["daily", "practice"] as const).map((mode) => (
                  <Link
                    className={`button ${puzzle.mode === mode ? "primary" : "secondary"}`}
                    key={mode}
                    href={urlFor(mode, puzzle.difficulty)}
                  >
                    {mode.toUpperCase()}
                  </Link>
                ))}
              </nav>
              <nav className="stack-difficulties" aria-label="Difficulty">
                {(Object.keys(STACK_DIFFICULTIES) as StackDifficulty[]).map(
                  (d) => {
                    const config = STACK_DIFFICULTIES[d];
                    const result =
                      accountProgress?.difficulties[d] ??
                      progress?.difficulties[d];
                    const completed =
                      puzzle.mode === "daily"
                        ? Boolean(result)
                        : puzzle.difficulty === d && solved;
                    const stars = completed
                      ? puzzle.mode === "daily"
                        ? accountProgress?.difficulties[d]
                          ? (accountProgress.difficulties[d]!.stars ?? 0)
                          : (result?.stars ?? 0)
                        : getStackStars(moves, puzzle.pieceCount)
                      : 0;
                    return (
                      <Link
                        aria-current={
                          puzzle.difficulty === d ? "page" : undefined
                        }
                        className="panel"
                        key={d}
                        href={urlFor(puzzle.mode, d)}
                        scroll={false}
                      >
                        <strong>
                          <span className="stack-difficulty-label">
                            {d === "small" ? "EASY" : d.toUpperCase()}
                            <span
                              className={`stack-difficulty-indicator${completed ? " is-complete" : ""}`}
                              role="img"
                              aria-label={
                                completed ? "Completed" : "Not completed"
                              }
                            >
                              {completed ? (
                                "✓"
                              ) : (
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  aria-hidden="true"
                                >
                                  <circle
                                    cx="8"
                                    cy="8"
                                    r="3.5"
                                    strokeWidth="1.4"
                                  />
                                </svg>
                              )}
                            </span>
                          </span>
                          {completed && stars > 0 && (
                            <>
                              <span
                                className="stack-difficulty-divider"
                                aria-hidden="true"
                              >
                                ·
                              </span>
                              <span
                                className="stack-difficulty-stars"
                                role="img"
                                aria-label={`${stars} stars`}
                              >
                                {"★".repeat(stars)}
                              </span>
                            </>
                          )}
                        </strong>
                        <span>
                          {config.rows} &times; {config.cols} ·{" "}
                          {config.pieceSizes.length} pieces
                        </span>
                        <small>{config.description}</small>
                      </Link>
                    );
                  },
                )}
              </nav>
              {puzzle.mode === "practice" && (
                <div className="button-row">
                  <button
                    className="button"
                    onClick={() => {
                      window.location.href =
                        urlFor("practice", puzzle.difficulty) +
                        "&seed=" +
                        crypto.randomUUID().slice(0, 8);
                    }}
                  >
                    New puzzle
                  </button>
                  <button
                    className="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          window.location.origin +
                            window.location.pathname +
                            urlFor("practice", puzzle.difficulty) +
                            "&seed=" +
                            puzzle.seed,
                        );
                        setMessage("Challenge link copied.");
                      } catch {
                        setMessage(
                          "Copy the seed from the heading to share this puzzle.",
                        );
                      }
                    }}
                  >
                    Copy challenge
                  </button>
                </div>
              )}
            </div>
          </div>
          {initial.legacy ? (
            <section
              className="panel stack-legacy-completion"
              aria-label="Completed Daily result"
            >
              <h2>Completed</h2>
              <p>You solved this Daily challenge.</p>
              <p>
                {initial.remote?.stars
                  ? "?".repeat(initial.remote.stars)
                  : "Stars unavailable"}
              </p>
              <p>
                {initial.remote?.moves ?? "N/A"} moves ?{" "}
                {initial.remote?.durationMs === null
                  ? "Time unavailable"
                  : `${String(Math.floor((initial.remote?.durationMs ?? 0) / 60000)).padStart(2, "0")}:${String(Math.floor((initial.remote?.durationMs ?? 0) / 1000) % 60).padStart(2, "0")}`}
              </p>
              <p>
                Your original board arrangement isn&apos;t available on this
                device.
              </p>
            </section>
          ) : (
            <div
              className="stack-layout"
              id="perfect-stack-play"
              role="region"
              aria-label="Perfect Stack gameplay"
              data-stack-solved={solved ? "true" : undefined}
              tabIndex={-1}
              style={
                {
                  "--board-cols": puzzle.cols,
                  "--piece-max-cells": Math.max(
                    ...puzzle.pieces.map((piece) => piece.cells.length),
                  ),
                } as CSSProperties
              }
            >
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
                  <strong>{puzzle.pieceCount}</strong>
                  <small>OPTIMAL</small>
                </div>
              </div>

              <section className="stack-board-card">
                <div className="board-heading">
                  <div>
                    <span className="eyebrow blue">
                      {puzzle.mode === "daily"
                        ? "TODAY'S BOARD"
                        : "PRACTICE BOARD"}
                    </span>
                    <p>
                      {puzzle.rows} &times; {puzzle.cols} &bull;{" "}
                      {remaining.length} pieces left
                    </p>
                  </div>
                  <span className="streak-pill">{moves} MOVES</span>
                </div>
                <div className="stack-board-viewport">
                  <div
                    className="stack-grid"
                    ref={boardRef}
                    onPointerDown={(event) => {
                      const metrics = getBoardDragMetrics();
                      const cell =
                        metrics &&
                        getBoardCell(event.clientX, event.clientY, metrics);
                      const pid = cell && placedMap.get(key(cell));
                      if (pid && cell) startDrag(event, pid, cell);
                      else if (!dragRef.current)
                        suppressClickRef.current = false;
                    }}
                    onPointerMove={moveDrag}
                    onPointerUp={(event) => endDrag(event)}
                    onPointerCancel={(event) => endDrag(event, true)}
                    onLostPointerCapture={(event) => endDrag(event, true)}
                    style={
                      {
                        "--board-rows": puzzle.rows,
                        "--board-cols": puzzle.cols,
                        gridTemplateColumns: `repeat(${puzzle.cols}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${puzzle.rows}, minmax(0, 1fr))`,
                      } as CSSProperties
                    }
                  >
                    {Array.from(
                      { length: puzzle.rows * puzzle.cols },
                      (_, i) => {
                        const cell: [number, number] = [
                          Math.floor(i / puzzle.cols),
                          i % puzzle.cols,
                        ];
                        const k = key(cell);

                        const pid = placedMap.get(k);
                        const piece = pid
                          ? puzzle.pieces.find((p) => p.id === pid)
                          : null;
                        const previewed = dragPreview.has(k);
                        return (
                          <button
                            key={k}
                            aria-label={`Row ${cell[0] + 1}, column ${cell[1] + 1}`}
                            data-stack-cell="true"
                            data-row={cell[0]}
                            data-col={cell[1]}
                            data-stack-piece={pid}
                            className={`stack-cell target ${piece?.color || ""} ${previewed ? "drag-preview" : ""} ${previewed && !drag?.valid ? "drag-invalid" : ""}`}
                            style={
                              previewed && draggingPiece
                                ? ({
                                    "--drag-preview-color": `var(--${draggingPiece.color})`,
                                  } as CSSProperties)
                                : undefined
                            }
                            onClick={(event) => {
                              if (
                                suppressClickRef.current &&
                                event.detail !== 0
                              ) {
                                suppressClickRef.current = false;
                                return;
                              }
                              suppressClickRef.current = false;
                              if (solved) return;
                              if (pid) {
                                setSelected(pid);
                                setPlacements((p) =>
                                  p.filter((x) => x.pieceId !== pid),
                                );
                                setMessage(
                                  "Piece picked up. Rotate it in the tray or place it again.",
                                );
                              } else if (selected) tryPlace(selected, cell);
                            }}
                          />
                        );
                      },
                    )}
                  </div>
                </div>
                <p className="board-message" role="status">
                  <i />
                  {boardMessage}
                </p>
              </section>
              <aside className="stack-side">
                <section className="piece-tray" aria-label="Pieces">
                  <span className="eyebrow">
                    PIECES LEFT · {remaining.length}
                  </span>
                  <p className="stack-tray-hint">
                    <span className="piece-tray-count">
                      PIECES LEFT · {remaining.length}
                    </span>
                    <span>Swipe to scroll</span>
                  </p>
                  <div
                    className="piece-grid"
                    ref={pieceGridRef}
                    tabIndex={0}
                    role="region"
                    aria-label="Scrollable puzzle pieces"
                  >
                    {puzzle.pieces.map((piece) => {
                      const placed = placements.some(
                        (p) => p.pieceId === piece.id,
                      );
                      const cells = oriented(piece, rotations[piece.id] ?? 0);
                      return (
                        <button
                          onPointerDown={(event) => {
                            if (
                              event.pointerType !== "touch" ||
                              (event.target as Element).closest(
                                ".piece-drag-handle",
                              )
                            )
                              startDrag(event, piece.id);
                          }}
                          onPointerMove={moveDrag}
                          onPointerUp={(event) => endDrag(event)}
                          onPointerCancel={(event) => endDrag(event, true)}
                          onLostPointerCapture={(event) => endDrag(event, true)}
                          onClick={(event) => {
                            if (solved) return;
                            if (
                              suppressClickRef.current &&
                              event.detail !== 0
                            ) {
                              suppressClickRef.current = false;
                              return;
                            }
                            suppressClickRef.current = false;
                            setSelected(piece.id);
                            if (placed) {
                              setPlacements((p) =>
                                p.filter((x) => x.pieceId !== piece.id),
                              );
                              setMessage(
                                "Piece picked up. Tap again to rotate.",
                              );
                            } else rotatePiece(piece.id);
                          }}
                          key={piece.id}
                          disabled={solved}
                          aria-pressed={selected === piece.id}
                          aria-label={`${piece.id}: drag to place, or click to select and rotate`}
                          className={`piece-card ${selected === piece.id && !placed ? "selected" : ""} ${placed ? "placed" : ""} ${drag?.active && drag.pieceId === piece.id ? "drag-source" : ""}`}
                        >
                          <span
                            className="piece-drag-handle"
                            aria-hidden="true"
                            title="Drag piece"
                          >
                            ⠿
                          </span>
                          <span className="piece-viewport">
                            <PieceShape piece={piece} cells={cells} />
                          </span>
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
                    disabled={solved || !placements.length}
                  >
                    Undo
                  </button>
                  <button
                    className="button secondary"
                    onClick={clearBoard}
                    disabled={solved}
                  >
                    Clear
                  </button>
                </div>
              </aside>
            </div>
          )}
        </section>
      </div>
      <AdSlot placement="post-gameplay" />
      <footer className="site-footer">
        <span>SKG GAMES • PERFECT STACK</span>
        <Link href="/">Back to games</Link>
      </footer>
      {drag?.active && draggingPiece && (
        <div
          className={`stack-drag-ghost ${drag.valid ? "valid" : "invalid"}`}
          style={{
            left:
              drag.clientX -
              drag.pieceAnchor[1] *
                (drag.metrics.cellWidth + drag.metrics.columnGap) -
              drag.metrics.cellWidth / 2,
            top:
              drag.clientY -
              drag.pieceAnchor[0] *
                (drag.metrics.cellHeight + drag.metrics.rowGap) -
              drag.metrics.cellHeight / 2,
          }}
          aria-hidden="true"
        >
          <PieceShape
            piece={draggingPiece}
            cells={oriented(draggingPiece, rotations[draggingPiece.id] ?? 0)}
            cellSize={drag.metrics.cellWidth}
            cellHeight={drag.metrics.cellHeight}
            gap={drag.metrics.columnGap}
            rowGap={drag.metrics.rowGap}
          />
        </div>
      )}
    </main>
  );
}

function PieceShape({
  piece,
  cells,
  cellSize,
  cellHeight = cellSize,
  gap,
  rowGap = gap,
}: {
  piece: StackPiece;
  cells: Cell[];
  cellSize?: number;
  cellHeight?: number;
  gap?: number;
  rowGap?: number;
}) {
  const maxR = Math.max(...cells.map((c) => c[0])),
    maxC = Math.max(...cells.map((c) => c[1]));
  const set = new Set(cells.map(key));
  return (
    <span
      className="piece-shape"
      style={
        {
          "--piece-cols": maxC + 1,
          "--piece-rows": maxR + 1,
          gridTemplateColumns: `repeat(${maxC + 1}, ${cellSize === undefined ? "var(--tray-cell-size, 18px)" : `${cellSize}px`})`,
          gridTemplateRows: `repeat(${maxR + 1}, ${cellHeight === undefined ? "var(--tray-cell-size, 18px)" : `${cellHeight}px`})`,
          columnGap: gap ?? "var(--tray-cell-gap, 4px)",
          rowGap: rowGap ?? "var(--tray-cell-gap, 4px)",
        } as CSSProperties
      }
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
