import { AlibiGame } from "@/components/games/alibi-game";
import {
  AlibiUnavailableError,
  getDailyAlibiChallenge,
} from "@/lib/games/daily-alibi/daily";
import { getGameDate } from "@/lib/game-date";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Daily Alibi | SKG Games" };
export const dynamic = "force-dynamic";

export default async function AlibiPage() {
  let caseData;
  try {
    caseData = await getDailyAlibiChallenge();
  } catch (error) {
    console.error(
      `[Daily Alibi unavailable: ${getGameDate()}]`,
      error instanceof AlibiUnavailableError
        ? error.message
        : "Database retrieval failed; check migrations and connectivity.",
    );
  }
  if (caseData) return <AlibiGame caseData={caseData} />;
  return (
    <main className="alibi-shell">
      <SiteHeader />
      <section className="alibi-hero container">
        <h1>Daily Alibi</h1>
        <p role="status">
          Today&apos;s Daily Alibi case isn&apos;t available yet. Please check
          back shortly.
        </p>
      </section>
    </main>
  );
}
