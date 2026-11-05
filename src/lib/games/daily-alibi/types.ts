import type { AlibiCase, DailyAlibiCase } from "../alibi";

// Editorial IDs are stable; the existing game model and saved-result format stay intact.
export type CuratedAlibiCase = Omit<AlibiCase, "challengeNumber"> & {
  caseId: string;
  clueIds: string[];
  review: { mechanism: string; deduction: string; exclusions: string[] };
};

export function toDailyAlibiCase(
  entry: CuratedAlibiCase,
  challengeDate: string,
  challengeNumber: number,
): DailyAlibiCase {
  return {
    challengeDate,
    challengeNumber,
    title: entry.title,
    dek: entry.dek,
    briefTitle: entry.briefTitle,
    brief: entry.brief,
    objective: entry.objective,
    clues: [...entry.clues],
    suspects: entry.suspects.map((s) => ({ ...s })),
  };
}
