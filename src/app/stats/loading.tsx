import { SiteHeader } from "@/components/site-header";
import { StatsSkeleton } from "@/components/stats-skeleton";

export default function StatsLoading() {
  return (
    <main className="site-shell">
      <SiteHeader />
      <StatsSkeleton />
    </main>
  );
}
