import {
  getAnonymousId,
  getDailyAlibiResult,
  getStackDailyProgress,
} from "../client-progress";
import { dailyAlibi, fingerprintAlibiCase } from "../games/alibi";
import {
  parseResult,
  resultKey,
  uuid,
  type GameResult,
  type HistoryResult,
} from "./shared";

export const RESULTS_KEY = "skg-results-v1";
export const RESULTS_CHANGED = "skg-results-changed";
type Entry = {
  value: GameResult;
  owner: string | null;
  synced: boolean;
  guestId: string | null;
};
type Store = {
  version: 1;
  entries: Entry[];
  migrated: boolean;
  claimedGroups: Record<string, string>;
};
let actor: string | null = null;
let running: Promise<boolean> | null = null;
let runningScope: string | null = null;
let volatile: Entry[] = [];
export function setResultActor(accountKey: string | null) {
  actor = accountKey;
}
function read(): Store {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESULTS_KEY) ?? "null");
    if (parsed?.version === 1 && Array.isArray(parsed.entries))
      return {
        version: 1,
        migrated: parsed.migrated === true,
        claimedGroups:
          parsed.claimedGroups && typeof parsed.claimedGroups === "object"
            ? (Object.fromEntries(
                Object.entries(parsed.claimedGroups).filter(
                  ([key, value]) => uuid(key) && typeof value === "string",
                ),
              ) as Record<string, string>)
            : {},
        entries: parsed.entries.flatMap((e: Entry) => {
          const value = parseResult(e?.value);
          return value &&
            (e.owner === null || typeof e.owner === "string") &&
            typeof e.synced === "boolean"
            ? [
                {
                  value,
                  owner: e.owner,
                  synced: e.synced,
                  guestId: uuid(e.guestId) ? e.guestId : null,
                },
              ]
            : [];
        }),
      };
  } catch {
    /* Blocked, full or malformed storage must never block gameplay. */
  }
  return { version: 1, entries: [], migrated: false, claimedGroups: {} };
}
function write(store: Store) {
  try {
    localStorage.setItem(RESULTS_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}
function changed() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(RESULTS_CHANGED));
}
export function localResults(accountKey: string | null): HistoryResult[] {
  return [...read().entries, ...volatile]
    .filter((e) => e.owner === accountKey || e.owner === null)
    .map((e) => ({ ...e.value, verified: false }));
}
export function queueResult(value: GameResult) {
  const result = parseResult(value);
  if (!result) return false;
  const store = read();
  if (
    [...store.entries, ...volatile].some(
      (e) =>
        resultKey(e.value) === resultKey(result) &&
        (e.owner === actor || e.owner === null),
    )
  )
    return true;
  const entry = {
    value: result,
    owner: actor,
    synced: false,
    guestId: actor ? null : getAnonymousId(),
  };
  store.entries.push(entry);
  const persisted = write(store);
  if (!persisted) volatile.push(entry);
  changed();
  return persisted;
}
export function storageUnavailable() {
  return volatile.length > 0;
}
export function ownedStackResults(accountKey: string, date: string) {
  return read()
    .entries.filter(
      (e) =>
        e.owner === accountKey &&
        e.value.gameSlug === "perfect-stack" &&
        e.value.mode === "daily" &&
        e.value.challengeDate === date,
    )
    .map((e) => e.value);
}
// Reuse the completion queue and original event identity for missing snapshots.
// This is called only for a legacy result returned by the account progress API.
export function queueStackBackfill(accountKey: string, value: GameResult) {
  if (
    actor !== accountKey ||
    value.gameSlug !== "perfect-stack" ||
    value.mode !== "daily" ||
    !parseResult(value)
  )
    return false;
  const store = read();
  const entry = store.entries.find(
    (e) => e.owner === accountKey && resultKey(e.value) === resultKey(value),
  );
  if (entry) {
    entry.value = value;
    entry.synced = false;
  } else
    store.entries.push({
      value,
      owner: accountKey,
      synced: false,
      guestId: null,
    });
  return write(store);
}
export function endResultSession() {
  actor = null;
  // Local completed boards remain untouched, but the next guest gets a new claim group.
  try {
    localStorage.setItem("skg-anonymous-id", crypto.randomUUID());
  } catch {}
}
export function migrateLocalResults() {
  const store = read();
  if (store.migrated) return;
  // Import only records with an actual puzzle date. No completion date is fabricated.
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(localStorage.getItem("skg-progress-v1") ?? "{}");
  } catch {}
  const alibi = raw?.dailyAlibiResults;
  if (alibi && typeof alibi === "object")
    for (const date of Object.keys(alibi)) {
      const saved = getDailyAlibiResult(date);
      if (
        !saved ||
        saved.puzzleFingerprint !== fingerprintAlibiCase(dailyAlibi)
      )
        continue;
      const suspect = dailyAlibi.suspects.find(
        (s) => s.key === saved.accusedSuspectId,
      );
      if (!suspect) continue;
      const value: GameResult = {
        eventId: crypto.randomUUID(),
        gameSlug: "daily-alibi",
        mode: "daily",
        challengeDate: date,
        challengeNumber: saved.challengeNumber,
        completedAt: new Date(saved.completedAt).toISOString(),
        solved: suspect.correct,
        moves: null,
        durationMs: null,
        result: { suspect: suspect.key },
      };
      if (!store.entries.some((e) => resultKey(e.value) === resultKey(value)))
        store.entries.push({
          value,
          owner: actor,
          synced: false,
          guestId: getAnonymousId(),
        });
    }
  try {
    raw = JSON.parse(localStorage.getItem("skg-stack-progress-v2") ?? "{}");
  } catch {
    raw = {};
  }
  if (raw && typeof raw === "object")
    for (const date of Object.keys(raw)) {
      for (const [difficulty, result] of Object.entries(
        getStackDailyProgress(date).difficulties,
      )) {
        if (!result) continue;
        // Challenge number was not retained by older Stack saves; server resolves it by date.
        const value: GameResult = {
          eventId: crypto.randomUUID(),
          gameSlug: "perfect-stack",
          mode: "daily",
          difficulty: difficulty as GameResult["difficulty"],
          challengeDate: date,
          challengeNumber: null,
          completedAt: null,
          solved: true,
          moves: result.moves,
          durationMs: result.durationMs,
          puzzleSeed: result.puzzleSeed,
          result: { placements: result.placements },
        };
        if (!store.entries.some((e) => resultKey(e.value) === resultKey(value)))
          store.entries.push({
            value,
            owner: actor,
            synced: false,
            guestId: getAnonymousId(),
          });
      }
    }
  store.migrated = true;
  write(store);
  changed();
}
export async function syncResults(accountKey: string): Promise<boolean> {
  if (running) {
    if (runningScope === accountKey) return running;
    await running.catch(() => {});
    return syncResults(accountKey);
  }
  runningScope = accountKey;
  running = performSync(accountKey).finally(() => {
    running = null;
  });
  return running;
}
async function performSync(accountKey: string): Promise<boolean> {
  if (actor !== accountKey) return false;
  let store = read();
  let legacyId: string | null = null;
  try {
    legacyId = localStorage.getItem("skg-anonymous-id");
  } catch {}
  const needsLegacyClaim = uuid(legacyId) && !store.claimedGroups[legacyId];
  for (const entry of volatile)
    if (!store.entries.some((e) => e.value.eventId === entry.value.eventId))
      store.entries.push(entry);
  if (
    !store.entries.some(
      (e) =>
        !e.synced &&
        (e.owner === null ||
          e.owner === accountKey ||
          e.owner.startsWith("guest:")),
    ) &&
    !volatile.some((e) => e.owner === accountKey) &&
    !needsLegacyClaim
  )
    return false;
  // Bind pending guests before any upload. Never upload if ownership cannot be saved.
  for (const e of store.entries) if (e.owner === null) e.owner = accountKey;
  if (!write(store))
    throw new Error(
      "Browser storage is unavailable. Keep this tab open and enable storage to save your results.",
    );
  volatile = [];
  const guestIds = [
    ...new Set([
      ...(needsLegacyClaim ? [legacyId!] : []),
      ...store.entries
        .filter(
          (e) =>
            (e.owner === accountKey || e.owner?.startsWith("guest:")) &&
            !e.synced &&
            e.guestId,
        )
        .map((e) => e.guestId!),
    ]),
  ];
  let blocked = false;
  let associated = 0;
  for (const anonymousId of guestIds) {
    if (store.claimedGroups[anonymousId] === accountKey) continue;
    const claim = await fetch("/api/auth/claim-anonymous", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SKG-Account": accountKey,
      },
      body: JSON.stringify({ anonymousId }),
    });
    if (!claim.ok)
      throw new Error("Could not sync results. Your browser history is safe.");
    const claimed = await claim.json();
    if (!claimed.persisted)
      throw new Error("Results are waiting to sync. Please try again later.");
    if (!claimed.claimed) {
      // Quarantine another account's guest group; never display or upload it for this account.
      const fresh = read();
      fresh.claimedGroups[anonymousId] = `guest:${anonymousId}`;
      for (const e of fresh.entries)
        if (e.guestId === anonymousId && !e.synced)
          e.owner = `guest:${anonymousId}`;
      if (!write(fresh)) throw new Error("Could not save guest ownership.");
      blocked = true;
    } else {
      const fresh = read();
      fresh.claimedGroups[anonymousId] = accountKey;
      associated +=
        typeof claimed.associated === "number" ? claimed.associated : 0;
      for (const e of fresh.entries)
        if (e.guestId === anonymousId && e.owner?.startsWith("guest:"))
          e.owner = accountKey;
      if (!write(fresh)) throw new Error("Could not save guest ownership.");
    }
  }
  store = read();
  const pending = store.entries.filter(
    (e) => e.owner === accountKey && !e.synced,
  );
  let failed = false;
  for (const entry of pending) {
    if (actor !== accountKey) return false;
    const response = await fetch("/api/games/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SKG-Account": accountKey,
      },
      body: JSON.stringify(entry.value),
    });
    const receipt = await response.json().catch(() => null);
    if (!response.ok || !receipt?.persisted) {
      failed = true;
      continue;
    }
    // Re-read so results added during the request are never overwritten.
    const fresh = read();
    const saved = fresh.entries.find(
      (e) => e.value.eventId === entry.value.eventId && e.owner === accountKey,
    );
    if (saved) saved.synced = true;
    else fresh.entries.push({ ...entry, synced: true });
    if (!write(fresh))
      throw new Error(
        "Results saved online; local confirmation will retry later.",
      );
    volatile = volatile.filter((e) => e.value.eventId !== entry.value.eventId);
    changed();
  }
  if (blocked)
    throw new Error(
      "Some older guest results belong to another account and were not imported.",
    );
  if (failed)
    throw new Error(
      "Some results are waiting to sync. Your browser history is safe.",
    );
  return pending.length > 0 || associated > 0;
}
export function newResult(
  input: Omit<GameResult, "eventId" | "completedAt">,
): GameResult {
  return {
    ...input,
    eventId: crypto.randomUUID(),
    completedAt: new Date().toISOString(),
  };
}
