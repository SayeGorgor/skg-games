import { getGameDate } from "../../game-date";
import type { CuratedAlibiCase } from "./types";
import { getAlibiCaseFingerprint, validateAlibiCatalog } from "./validation";

export function calendarDate(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error(`Invalid calendar date: ${value}`);
  return value;
}
export function addCalendarDays(value: string, days: number) {
  const date = new Date(calendarDate(value) + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export type AlibiAssignment = {
  challengeDate: string;
  challengeNumber: number;
  caseId: string | null;
  fingerprint: string | null;
  complete: boolean;
};
export type PlannedAlibi = {
  challengeDate: string;
  challengeNumber: number;
  entry: CuratedAlibiCase;
  fingerprint: string;
};
export function planAlibiDailies(
  catalog: CuratedAlibiCase[],
  existing: AlibiAssignment[],
  start: string,
  days: number,
): PlannedAlibi[] {
  calendarDate(start);
  if (!Number.isInteger(days) || days < 1 || days > 366)
    throw new Error("--days must be 1–366");
  const errors = validateAlibiCatalog(catalog);
  if (errors.length) throw new Error(JSON.stringify(errors));
  const dates = Array.from({ length: days }, (_, i) =>
    addCalendarDays(start, i),
  );
  for (const row of existing)
    if (dates.includes(row.challengeDate) && !row.complete)
      throw new Error(
        `Existing Daily Alibi ${row.challengeDate} is incomplete. Repair it explicitly; seeding will not overwrite it.`,
      );
  const missing = dates.filter(
    (d) => !existing.some((r) => r.challengeDate === d),
  );
  const available = catalog
    .map((entry) => ({ entry, fingerprint: getAlibiCaseFingerprint(entry) }))
    .filter(
      (c) =>
        !existing.some(
          (r) => r.caseId === c.entry.caseId || r.fingerprint === c.fingerprint,
        ),
    )
    .sort((a, b) => a.entry.caseId.localeCompare(b.entry.caseId));
  if (available.length < missing.length)
    throw new Error(
      `Cannot prepare ${missing.length} Daily Alibi challenges. ${available.length} unused curated cases remain. ${missing.length - available.length} additional cases are required.`,
    );
  const anchor = [...existing].sort((a, b) =>
    a.challengeDate.localeCompare(b.challengeDate),
  )[0];
  const epoch = calendarDate(
    anchor?.challengeDate ?? process.env.DAILY_ALIBI_EPOCH_DATE ?? "2026-10-25",
  );
  const base =
    anchor?.challengeNumber ??
    Number(process.env.DAILY_ALIBI_EPOCH_NUMBER ?? 127);
  const plan = missing.map((challengeDate, i) => ({
    challengeDate,
    challengeNumber:
      base +
      Math.round((Date.parse(challengeDate) - Date.parse(epoch)) / 86400000),
    ...available[i],
  }));
  if (
    plan.some(
      (p) =>
        !Number.isSafeInteger(p.challengeNumber) ||
        p.challengeNumber < 0 ||
        p.challengeNumber > 2147483647 ||
        existing.some((r) => r.challengeNumber === p.challengeNumber),
    )
  )
    throw new Error(
      "Challenge numbering conflict. Check the Daily Alibi epoch and existing calendar.",
    );
  return plan;
}
export function alibiCoverage(
  catalog: CuratedAlibiCase[],
  existing: AlibiAssignment[],
  today = getGameDate(),
) {
  const ready = new Set(
    existing.filter((r) => r.complete).map((r) => r.challengeDate),
  );
  let next = today;
  let contiguous = 0;
  while (ready.has(next)) {
    contiguous++;
    next = addCalendarDays(next, 1);
  }
  return {
    today,
    todayPrepared: ready.has(today),
    upcomingPreparedDays: Math.max(0, contiguous - 1),
    nextMissingDate: next,
    unusedCuratedCases: catalog.filter(
      (c) =>
        !existing.some(
          (r) =>
            r.caseId === c.caseId ||
            r.fingerprint === getAlibiCaseFingerprint(c),
        ),
    ).length,
  };
}
