import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { alibiCatalog } from "./catalog";
import { toDailyAlibiCase } from "./types";
import {
  getRestoredDailyAlibiState,
  saveDailyAlibiResult,
} from "../../client-progress";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());
it.each(alibiCatalog)(
  "restores all four finalized outcomes for $caseId without changing the saved-result format",
  (entry) => {
    for (let i = 0; i < 4; i++) {
      const date = `2026-11-${String(4 + i).padStart(2, "0")}`;
      const game = toDailyAlibiCase(entry, date, 137 + i);
      const accused = game.suspects[i];
      saveDailyAlibiResult(game, accused.key);
      expect(getRestoredDailyAlibiState(game)?.accused).toEqual(accused);
      saveDailyAlibiResult(game, game.suspects[(i + 1) % 4].key);
      expect(getRestoredDailyAlibiState(game)?.accused.key).toBe(accused.key);
      const changed = structuredClone(game);
      changed.clues[0] += " changed";
      expect(getRestoredDailyAlibiState(changed)).toBeNull();
    }
  },
);
