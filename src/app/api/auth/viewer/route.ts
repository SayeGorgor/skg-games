import { getViewer } from "@/lib/auth/viewer";
export async function GET() {
  const { name, email, authenticated, premium } = await getViewer();
  return Response.json(
    { name, email, authenticated, premium },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
