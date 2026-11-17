import { requirePermission } from "@/lib/auth/authorization";
/** Guard above the loading boundary; analytics admission never grants users:read. */
export default async function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermission("users:read");
  return children;
}
