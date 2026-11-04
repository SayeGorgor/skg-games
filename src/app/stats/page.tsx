import { StatsClient } from "@/components/stats-client";
import { SiteHeader } from "@/components/site-header";
export const metadata = {
  title: "Your Stats | SKG Games",
  description: "Your daily games, personal bests, and completed game history.",
};
export default function StatsPage() {
  return (
    <main className="site-shell">
      <SiteHeader />
      <StatsClient />
    </main>
  );
}
