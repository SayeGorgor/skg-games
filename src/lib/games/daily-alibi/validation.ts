import { createHash } from "node:crypto";
import { fingerprintAlibiCase } from "../alibi";
import { toDailyAlibiCase, type CuratedAlibiCase } from "./types";

export type ValidationIssue = {
  caseId: string;
  field: string;
  code: "required" | "count" | "duplicate" | "culprit" | "editorial";
  message: string;
};
const meaningful = (value: unknown, min = 1): value is string =>
  typeof value === "string" && value.trim().length >= min;

// Separate from the legacy browser fingerprint: SHA-256, no case ID, Daily
// date, challenge number, editorial notes or database-generated identifiers.
export function getAlibiCaseFingerprint(entry: CuratedAlibiCase) {
  const normalize = (v: unknown): unknown => {
    if (typeof v === "string")
      return v.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => [k, normalize(x)]),
      );
    return v;
  };
  const {
    challengeDate: _date,
    challengeNumber: _number,
    ...content
  } = toDailyAlibiCase(entry, "2000-01-01", 1);
  void _date;
  void _number;
  const suspects = content.suspects
    .map(({ key: _key, ...s }) => {
      void _key;
      return s;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return createHash("sha256")
    .update(JSON.stringify(normalize({ ...content, suspects })))
    .digest("hex");
}

export function validateDailyAlibiCase(
  entry: CuratedAlibiCase,
): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const add = (field: string, code: ValidationIssue["code"], message: string) =>
    errors.push({ caseId: entry.caseId || "(missing)", field, code, message });
  for (const field of [
    "caseId",
    "title",
    "dek",
    "briefTitle",
    "brief",
    "objective",
  ] as const)
    if (!meaningful(entry[field]))
      add(field, "required", `${field} is required`);
  if (!Array.isArray(entry.suspects) || entry.suspects.length !== 4)
    add("suspects", "count", "Exactly four suspects required");
  const suspects = Array.isArray(entry.suspects) ? entry.suspects : [];
  const keys = new Set<string>();
  for (const s of suspects) {
    for (const field of [
      "key",
      "initial",
      "name",
      "role",
      "statement",
      "explanation",
    ] as const)
      if (!meaningful(s?.[field], field === "explanation" ? 40 : 1))
        add(
          `suspects.${field}`,
          "required",
          `${field} is missing or too short`,
        );
    if (typeof s?.correct !== "boolean")
      add("suspects.correct", "required", "Correctness must be boolean");
    if (keys.has(s?.key))
      add("suspects.key", "duplicate", "Duplicate suspect ID");
    keys.add(s?.key);
  }
  if (suspects.filter((s) => s?.correct === true).length !== 1)
    add(
      "suspects.correct",
      "culprit",
      "Exactly one existing suspect must be the culprit",
    );
  if (
    !Array.isArray(entry.clues) ||
    entry.clues.length < 4 ||
    entry.clues.length > 6
  )
    add("clues", "count", "Four to six meaningful clues required");
  for (const c of entry.clues ?? [])
    if (!meaningful(c, 30))
      add("clues", "required", "Clue must contain at least 30 characters");
  if (
    !Array.isArray(entry.clueIds) ||
    entry.clueIds.length !== entry.clues?.length ||
    entry.clueIds.some((id) => !meaningful(id))
  )
    add("clueIds", "required", "Each clue needs an editorial ID");
  if (
    new Set(entry.clueIds).size !== entry.clueIds?.length ||
    new Set(entry.clues).size !== entry.clues?.length
  )
    add("clues", "duplicate", "Duplicate clue ID or text");
  if (
    !meaningful(entry.review?.mechanism) ||
    !meaningful(entry.review?.deduction, 60) ||
    entry.review?.exclusions?.length !== 3 ||
    entry.review.exclusions.some((x) => !meaningful(x, 30))
  )
    add(
      "review",
      "editorial",
      "Document the deduction and three exclusions; human review is still required",
    );
  if (!errors.length)
    fingerprintAlibiCase(toDailyAlibiCase(entry, "2000-01-01", 1));
  return errors;
}

export function validateAlibiCatalog(catalog: CuratedAlibiCase[]) {
  const errors = catalog.flatMap(validateDailyAlibiCase);
  for (const [field, values] of [
    ["caseId", catalog.map((c) => c.caseId)],
    [
      "title",
      catalog.map((c) =>
        typeof c.title === "string" ? c.title.trim().toLowerCase() : "",
      ),
    ],
    [
      "fingerprint",
      catalog.map((c, i) =>
        validateDailyAlibiCase(c).length
          ? `invalid-${i}`
          : getAlibiCaseFingerprint(c),
      ),
    ],
  ] as const) {
    const seen = new Set<string>();
    values.forEach((v, i) => {
      if (seen.has(v))
        errors.push({
          caseId: catalog[i].caseId,
          field,
          code: "duplicate",
          message: `Duplicate ${field}`,
        });
      seen.add(v);
    });
  }
  return errors;
}
