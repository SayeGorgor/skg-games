import { getViewer } from "@/lib/auth/viewer";
import { claimAnonymousProgress } from "@/lib/auth/claim";
import { validAnonymousId } from "@/lib/auth/flow";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const viewer = await getViewer();
  if (!viewer.userId)
    return Response.json({ error: "Sign in first" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!validAnonymousId(body?.anonymousId))
    return Response.json(
      { error: "Invalid anonymous identifier" },
      { status: 400 },
    );
  try {
    return Response.json(
      await claimAnonymousProgress(viewer.userId, body.anonymousId),
    );
  } catch {
    return Response.json(
      {
        error:
          "Progress could not be associated. Your browser progress is safe; try again.",
      },
      { status: 503 },
    );
  }
}
