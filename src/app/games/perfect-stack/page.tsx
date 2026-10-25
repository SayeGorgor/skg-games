import { PerfectStackGame } from "@/components/games/perfect-stack-game";
import { dailyStackPuzzle } from "@/lib/games/perfect-stack";

export const metadata = { title: "Perfect Stack | SKG Games" };

export default function PerfectStackPage() {
  return <PerfectStackGame puzzle={dailyStackPuzzle} />;
}
