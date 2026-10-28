import { AlibiGame } from "@/components/games/alibi-game";
import { dailyAlibi } from "@/lib/games/alibi";
import { getGameDate } from "@/lib/game-date";

export const metadata = { title: "Daily Alibi | SKG Games" };
export const dynamic = "force-dynamic";

export default function AlibiPage() {
  return (
    <AlibiGame caseData={{ ...dailyAlibi, challengeDate: getGameDate() }} />
  );
}
