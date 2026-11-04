import { getGameDate } from "../game-date";
import type { StackPlacement } from "../games/perfect-stack";

export const GAME_NAMES = {
  "daily-alibi": "Daily Alibi",
  "perfect-stack": "Perfect Stack",
} as const;
export type GameSlug = keyof typeof GAME_NAMES;
export type GameResult = {
  eventId: string;
  gameSlug: GameSlug;
  mode: "daily" | "practice";
  difficulty?: "small" | "medium" | "hard";
  challengeDate: string | null;
  challengeNumber: number | null;
  completedAt: string | null;
  solved: boolean;
  moves: number | null;
  durationMs: number | null;
  puzzleSeed?: string;
  result: { suspect?: string; placements?: StackPlacement[]; stars?: number };
};
export type HistoryResult = GameResult & { verified: boolean };
export const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export const dateOnly = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const integer = (v: unknown, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
export function parseResult(value: unknown): GameResult | null {
  if (!value || typeof value !== "object") return null;
  const v = value as GameResult;
  if (
    !uuid(v.eventId) ||
    typeof v.gameSlug !== "string" ||
    !Object.hasOwn(GAME_NAMES, v.gameSlug) ||
    !["daily", "practice"].includes(v.mode) ||
    typeof v.solved !== "boolean" ||
    (v.completedAt !== null &&
      (typeof v.completedAt !== "string" ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(
          v.completedAt,
        ) ||
        !dateOnly(v.completedAt.slice(0, 10)) ||
        !Number.isFinite(Date.parse(v.completedAt)) ||
        Date.parse(v.completedAt) > Date.now() + 300000)) ||
    (v.moves !== null && !integer(v.moves, 1000000)) ||
    (v.durationMs !== null && !integer(v.durationMs, 2147483647)) ||
    !v.result ||
    typeof v.result !== "object"
  )
    return null;
  if (
    v.mode === "daily" &&
    (!dateOnly(v.challengeDate) ||
      v.challengeDate > getGameDate() ||
      (v.challengeNumber !== null && !integer(v.challengeNumber, 2147483647)) ||
      (v.gameSlug === "daily-alibi" && v.challengeNumber === null))
  )
    return null;
  if (
    v.mode === "practice" &&
    (v.challengeDate !== null || v.challengeNumber !== null)
  )
    return null;
  if (v.gameSlug === "daily-alibi") {
    if (
      v.mode !== "daily" ||
      typeof v.result.suspect !== "string" ||
      v.result.suspect.length > 128 ||
      !v.result.suspect.length
    )
      return null;
  } else {
    if (
      !["small", "medium", "hard"].includes(v.difficulty ?? "") ||
      (typeof v.puzzleSeed !== "string" &&
        !(
          v.puzzleSeed === undefined &&
          v.completedAt === null &&
          v.mode === "daily" &&
          v.result.placements === undefined
        )) ||
      (typeof v.puzzleSeed === "string" && v.puzzleSeed.length > 200) ||
      !v.solved ||
      v.moves === null ||
      v.durationMs === null
    )
      return null;
    if (
      v.result.placements !== undefined &&
      (!Array.isArray(v.result.placements) ||
        v.result.placements.length > 13 ||
        !v.result.placements.every(
          (p) =>
            p &&
            typeof p.pieceId === "string" &&
            p.pieceId.length <= 64 &&
            integer(p.rotation, 3) &&
            Array.isArray(p.anchor) &&
            p.anchor.length === 2 &&
            p.anchor.every((n) => integer(n, 7)) &&
            Array.isArray(p.cells) &&
            p.cells.length >= 4 &&
            p.cells.length <= 6 &&
            p.cells.every(
              (c) =>
                Array.isArray(c) &&
                c.length === 2 &&
                c.every((n) => integer(n, 7)),
            ),
        ))
    )
      return null;
  }
  return {
    eventId: v.eventId,
    gameSlug: v.gameSlug,
    mode: v.mode,
    difficulty: v.gameSlug === "perfect-stack" ? v.difficulty : undefined,
    challengeDate: v.challengeDate,
    challengeNumber: v.challengeNumber,
    completedAt: v.completedAt,
    solved: v.solved,
    moves: v.moves,
    durationMs: v.durationMs,
    puzzleSeed: v.gameSlug === "perfect-stack" ? v.puzzleSeed : undefined,
    result:
      v.gameSlug === "daily-alibi"
        ? { suspect: v.result.suspect }
        : {
            placements: v.result.placements?.map((p) => ({
              pieceId: p.pieceId,
              rotation: p.rotation,
              anchor: [...p.anchor] as [number, number],
              cells: p.cells.map((c) => [...c] as [number, number]),
            })),
          },
  };
}
export function resultKey(
  r: Pick<
    GameResult,
    "gameSlug" | "mode" | "difficulty" | "challengeDate" | "eventId"
  >,
) {
  return r.mode === "daily"
    ? `${r.gameSlug}:${r.challengeDate}:${r.difficulty ?? "default"}`
    : `practice:${r.eventId}`;
}
export function uniqueHistory(rows: HistoryResult[]) {
  const daily = new Map<string, HistoryResult>();
  for (const r of rows) {
    const legacyDate = r.completedAt
      ? getGameDate(new Date(r.completedAt))
      : r.eventId;
    const key =
      r.mode === "daily"
        ? `${r.gameSlug}:${r.challengeDate ?? `legacy:${r.challengeNumber}:${legacyDate}`}:${r.difficulty ?? "default"}`
        : r.eventId;
    const old = daily.get(key);
    // Preserve the first finalized accusation, and the best existing Stack run.
    if (
      !old ||
      (r.gameSlug === "perfect-stack" &&
        (r.moves ?? Infinity) < (old.moves ?? Infinity)) ||
      (r.gameSlug === "daily-alibi" &&
        (r.completedAt ?? "~") < (old.completedAt ?? "~"))
    )
      daily.set(key, r);
  }
  return [...daily.values()].sort(
    (a, b) =>
      (b.completedAt ?? b.challengeDate ?? "").localeCompare(
        a.completedAt ?? a.challengeDate ?? "",
      ) || a.eventId.localeCompare(b.eventId),
  );
}
export function dailyStreak(rows: HistoryResult[], today = getGameDate()) {
  const dates = [
    ...new Set(
      rows
        .filter((r) => r.mode === "daily" && r.solved && r.challengeDate)
        .map((r) => r.challengeDate!),
    ),
  ].sort();
  let longest = 0,
    run = 0,
    previous = "";
  for (const date of dates) {
    run = Date.parse(date) - Date.parse(previous) === 86400000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  const yesterday = new Date(Date.parse(today) - 86400000)
    .toISOString()
    .slice(0, 10);
  return {
    current:
      previous === today ||
      (previous === yesterday &&
        !rows.some(
          (r) => r.mode === "daily" && r.challengeDate === today && !r.solved,
        ))
        ? run
        : 0,
    longest,
  };
}
export function summarize(rows: HistoryResult[]) {
  const results = uniqueHistory(rows);
  return {
    total: results.length,
    streak: dailyStreak(results),
    games: new Set(results.map((r) => r.gameSlug)).size,
    alibiPlayed: results.filter((r) => r.gameSlug === "daily-alibi").length,
    alibiWon: results.filter((r) => r.gameSlug === "daily-alibi" && r.solved)
      .length,
    byGame: Object.keys(GAME_NAMES).map((slug) => {
      const played = results.filter((r) => r.gameSlug === slug);
      return {
        slug: slug as GameSlug,
        played: played.length,
        won: played.filter((r) => r.solved).length,
        streak: dailyStreak(played),
        difficulties: ["small", "medium", "hard"].map((difficulty) => {
          const attempts = played.filter((r) => r.difficulty === difficulty);
          const moves = attempts.flatMap((r) =>
            r.moves === null ? [] : [r.moves],
          );
          const times = attempts.flatMap((r) =>
            r.durationMs === null ? [] : [r.durationMs],
          );
          return {
            difficulty,
            played: attempts.length,
            fewestMoves: moves.length ? Math.min(...moves) : null,
            averageMs: times.length
              ? times.reduce((a, b) => a + b, 0) / times.length
              : null,
          };
        }),
      };
    }),
  };
}
