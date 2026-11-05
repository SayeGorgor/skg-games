"use client";
import { useEffect, useState } from "react";
import { getStackDailyProgress } from "@/lib/client-progress";
import {
  ownedStackResults,
  queueStackBackfill,
  setResultActor,
  syncResults,
} from "@/lib/results/local";
import {
  stackAccountCacheKey,
  type AccountStackProgress,
} from "@/lib/games/perfect-stack/completion";

type State = {
  scope: string;
  date: string;
  data?: AccountStackProgress;
  error?: string;
};
const memory = new Map<string, { data: AccountStackProgress; at: number }>();
const key = stackAccountCacheKey;
function cached(scope: string, date: string): AccountStackProgress | undefined {
  try {
    const data = JSON.parse(localStorage.getItem(key(scope, date)) ?? "null");
    if (
      data?.accountKey === scope &&
      data?.challengeDate === date &&
      data?.difficulties
    )
      return data;
  } catch {
    /* Offline cache is optional. */
  }
}
export function useStackAccountProgress(
  scope: string | null | undefined,
  date: string | null,
) {
  const [state, setState] = useState<State | null>(() => {
    const hit = scope && date ? memory.get(key(scope, date)) : undefined;
    return hit && Date.now() - hit.at < 15000
      ? { scope: scope!, date: date!, data: hit.data }
      : null;
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!scope || !date) return;
    const controller = new AbortController();
    let running = false;
    const load = async (force = false) => {
      if (running) return;
      running = true;
      try {
        const hit = memory.get(key(scope, date));
        if (!force && !retry && hit && Date.now() - hit.at < 15000) {
          setState({ scope, date, data: hit.data });
          return;
        }
        setResultActor(scope);
        try {
          await syncResults(scope);
        } catch {
          /* Still read confirmed account results. */
        }
        const fetchProgress = async () => {
          const response = await fetch(
            `/api/games/perfect-stack/daily-progress?date=${date}`,
            { cache: "no-store", signal: controller.signal },
          );
          if (!response.ok)
            throw new Error(
              "Could not load your saved Daily board. Please retry.",
            );
          const data: AccountStackProgress = await response.json();
          if (
            data.accountKey !== scope ||
            data.challengeDate !== date ||
            !data.difficulties
          )
            throw new Error(
              "Your account changed. Please reload your saved board.",
            );
          return data;
        };
        let data = await fetchProgress();
        if (controller.signal.aborted) return;
        let backfill = false;
        const owned = ownedStackResults(scope, date);
        const scoped = getStackDailyProgress(date, scope);
        const old = getStackDailyProgress(date);
        for (const difficulty of ["small", "medium", "hard"] as const) {
          const result = data.difficulties[difficulty];
          if (
            !result ||
            result.placements ||
            result.moves === null ||
            result.durationMs === null
          )
            continue;
          const entry = owned.find(
            (e) =>
              e.difficulty === difficulty &&
              e.puzzleSeed === result.puzzleSeed &&
              e.moves === result.moves &&
              e.durationMs === result.durationMs,
          );
          // Unscoped legacy boards need an account-owned completion receipt before
          // they may be considered this user's original arrangement.
          const candidate =
            scoped.difficulties[difficulty] ??
            (entry ? old.difficulties[difficulty] : undefined);
          const candidateMatches =
            candidate?.puzzleSeed === result.puzzleSeed &&
            candidate.moves === result.moves &&
            candidate.durationMs === result.durationMs;
          const placements =
            entry?.result.placements ??
            (candidateMatches ? candidate?.placements : undefined);
          if (
            !placements ||
            (!entry &&
              (candidate?.puzzleSeed !== result.puzzleSeed ||
                candidate.moves !== result.moves ||
                candidate.durationMs !== result.durationMs))
          )
            continue;
          backfill =
            queueStackBackfill(scope, {
              eventId: result.eventId,
              gameSlug: "perfect-stack",
              mode: "daily",
              difficulty,
              challengeDate: date,
              challengeNumber: result.challengeNumber,
              puzzleSeed: result.puzzleSeed,
              completedAt: result.completedAt,
              solved: true,
              moves: result.moves,
              durationMs: result.durationMs,
              result: { placements },
            }) || backfill;
        }
        if (backfill) {
          try {
            await syncResults(scope);
            data = await fetchProgress();
          } catch {
            /* Keep the legacy completion locked. */
          }
        }
        if (controller.signal.aborted) return;
        memory.set(key(scope, date), { data, at: Date.now() });
        // Bound the in-memory cache; each persisted entry is account/date scoped.
        if (memory.size > 12) memory.delete(memory.keys().next().value!);
        try {
          localStorage.setItem(key(scope, date), JSON.stringify(data));
        } catch {
          /* No storage permission. */
        }
        setState({ scope, date, data });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            scope,
            date,
            data: cached(scope, date),
            error:
              error instanceof Error
                ? error.message
                : "Your saved board is unavailable.",
          });
      } finally {
        running = false;
      }
    };
    const refresh = () => void load(true);
    const frame = requestAnimationFrame(() => void load());
    window.addEventListener("skg-results-synced", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      cancelAnimationFrame(frame);
      controller.abort();
      window.removeEventListener("skg-results-synced", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [scope, date, retry]);
  return {
    state: state && state.scope === scope && state.date === date ? state : null,
    retry: () => setRetry((n) => n + 1),
  };
}
