import { describe, expect, it } from "vitest";
import { alibiCatalog } from "./catalog";
import {
  getAlibiCaseFingerprint,
  validateAlibiCatalog,
  validateDailyAlibiCase,
} from "./validation";
import { toDailyAlibiCase } from "./types";
import { fingerprintAlibiCase } from "../alibi";

describe("curated Daily Alibi content (structural checks, not a natural-language proof)", () => {
  it("has at least thirty distinct, fully constructible cases", () => {
    expect(alibiCatalog.length).toBeGreaterThanOrEqual(30);
    expect(validateAlibiCatalog(alibiCatalog)).toEqual([]);
    expect(new Set(alibiCatalog.map(getAlibiCaseFingerprint)).size).toBe(
      alibiCatalog.length,
    );
    for (const c of alibiCatalog) {
      const game = toDailyAlibiCase(c, "2026-11-04", 137);
      expect(game.suspects).toHaveLength(4);
      expect(game.suspects.filter((s) => s.correct)).toHaveLength(1);
      expect(new Set(game.suspects.map((s) => s.key)).size).toBe(4);
      expect(game.clues.length).toBeGreaterThanOrEqual(4);
      expect(fingerprintAlibiCase(game)).toMatch(/^alibi-v1-/);
    }
  });
  it("fingerprints content without case IDs, schedule dates, suspect IDs or editorial notes", () => {
    const a = alibiCatalog[0],
      b = structuredClone(a);
    b.caseId = "different-id";
    b.review.mechanism = "editor note";
    b.suspects.reverse().forEach((s) => {
      s.key += "-new";
    });
    expect(getAlibiCaseFingerprint(b)).toBe(getAlibiCaseFingerprint(a));
    b.title += " changed";
    expect(getAlibiCaseFingerprint(b)).not.toBe(getAlibiCaseFingerprint(a));
  });
  it("rejects duplicate IDs, titles and meaningful content", () => {
    const errors = validateAlibiCatalog([
      alibiCatalog[0],
      structuredClone(alibiCatalog[0]),
    ]);
    expect(errors.map((e) => e.field)).toEqual(
      expect.arrayContaining(["caseId", "title", "fingerprint"]),
    );
  });
  it("rejects incomplete clues, duplicated suspect IDs and missing or multiple culprits", () => {
    const broken = structuredClone(alibiCatalog[0]);
    broken.suspects[1].key = broken.suspects[0].key;
    broken.suspects.forEach((s) => {
      s.correct = false;
    });
    broken.clues = ["too short"];
    expect(validateDailyAlibiCase(broken).map((e) => e.code)).toEqual(
      expect.arrayContaining(["duplicate", "culprit", "count", "required"]),
    );
    broken.suspects.forEach((s) => {
      s.correct = true;
    });
    expect(
      validateDailyAlibiCase(broken).some((e) => e.code === "culprit"),
    ).toBe(true);
  });
});
