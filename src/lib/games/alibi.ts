export type AlibiSuspect = {
  key: string;
  initial: string;
  name: string;
  role: string;
  statement: string;
  correct: boolean;
  explanation: string;
};
export type AlibiCase = {
  challengeNumber: number;
  title: string;
  dek: string;
  briefTitle: string;
  brief: string;
  objective: string;
  clues: string[];
  suspects: AlibiSuspect[];
};
export type DailyAlibiCase = AlibiCase & { challengeDate: string };

// Content identity, independent of display order and Daily date. This is not a
// security hash; it prevents restoring an accusation against changed case data.
export function fingerprintAlibiCase(caseData: AlibiCase): string {
  const content = JSON.stringify([
    caseData.title,
    caseData.dek,
    caseData.briefTitle,
    caseData.brief,
    caseData.objective,
    caseData.clues,
    [...caseData.suspects]
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((suspect) => [
        suspect.key,
        suspect.initial,
        suspect.name,
        suspect.role,
        suspect.statement,
        suspect.correct,
        suspect.explanation,
      ]),
  ]);
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < content.length; i++)
    hash =
      ((hash ^ BigInt(content.charCodeAt(i))) * 0x100000001b3n) &
      0xffffffffffffffffn;
  return `alibi-v1-${hash.toString(16).padStart(16, "0")}`;
}

export const dailyAlibi: AlibiCase = {
  challengeNumber: 127,
  title: "The Gallery After Hours",
  dek: "A priceless diamond vanished after closing. Four people were still inside. One alibi does not survive the evidence.",
  briefTitle: "The Marlowe diamond disappeared at 9:17 PM.",
  brief:
    "The east gallery had already closed to visitors. Ava, Marcus, Leo, and Nina were the only people with access to the wing during the final half hour. Your job: decide whose story conflicts with the timeline.",
  objective:
    "Identify the suspect who could have used the security override and reached the display.",
  clues: [
    "The security system logged a manual override at 9:03 PM.",
    "Only staff with level-2 clearance can trigger a manual override.",
    "Marcus Bell’s badge exited the building at 8:51 PM.",
    "Camera footage shows Nina Shah entering the west stairwell at 9:05 PM.",
  ],
  suspects: [
    {
      key: "ava",
      initial: "A",
      name: "Ava Chen",
      role: "GALLERY CURATOR",
      statement: "“I was closing the west wing with Nina.”",
      correct: true,
      explanation:
        "Ava had the required clearance, and Nina is on camera away from Ava two minutes after the override. Ava’s shared-alibi claim is the one that conflicts with the timeline.",
    },
    {
      key: "marcus",
      initial: "M",
      name: "Marcus Bell",
      role: "SECURITY GUARD",
      statement: "“My shift ended before nine. I was already gone.”",
      correct: false,
      explanation:
        "Marcus’s badge shows that he exited before the override was triggered.",
    },
    {
      key: "leo",
      initial: "L",
      name: "Leo Foster",
      role: "ART DEALER",
      statement: "“I never left the reception hall.”",
      correct: false,
      explanation:
        "Nothing in the evidence gives Leo the staff clearance needed to trigger the override.",
    },
    {
      key: "nina",
      initial: "N",
      name: "Nina Shah",
      role: "RESTORATION TECH",
      statement: "“I went downstairs to get solvent.”",
      correct: false,
      explanation:
        "The camera places Nina in the west stairwell after the override, supporting rather than breaking her timeline.",
    },
  ],
};
