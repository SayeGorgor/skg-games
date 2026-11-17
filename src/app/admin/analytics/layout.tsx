import { requireAnalyticsAdmin } from "@/lib/analytics/access";
export default async function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAnalyticsAdmin();
  return children;
}
