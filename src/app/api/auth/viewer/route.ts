import { getViewer } from "@/lib/auth/viewer";
import { accountKey } from "@/lib/auth/account-key";
export async function GET() {
  const { name, email, authenticated, premium, userId } = await getViewer();
  return Response.json(
    {
      name,
      email,
      authenticated,
      premium,
      accountKey: userId ? accountKey(userId) : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
