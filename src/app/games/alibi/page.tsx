import { AlibiGame } from "@/components/games/alibi-game";
import { dailyAlibi } from "@/lib/games/alibi";

export const metadata = { title: "Daily Alibi | SKG Games" };

export default function AlibiPage() {
  return <AlibiGame caseData={dailyAlibi} />;
}
