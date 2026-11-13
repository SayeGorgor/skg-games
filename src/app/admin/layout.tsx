import { requireAnalyticsAdmin } from "@/lib/analytics/access";

/** Authorize above the analytics loading boundary, before streaming its shell. */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAnalyticsAdmin();
  return children;
}
