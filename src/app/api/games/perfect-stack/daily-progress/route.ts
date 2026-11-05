import { getViewer } from "@/lib/auth/viewer";
import { readAccountStackProgress } from "@/lib/games/perfect-stack/account-progress";
import { getGameDate } from "@/lib/game-date";
import { dateOnly } from "@/lib/results/shared";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  const viewer = await getViewer();
  if (!viewer.userId)
    return Response.json({ error: "Sign in first" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const date = params.get("date") ?? getGameDate();
  if (
    [...params.keys()].some((k) => k !== "date") ||
    !dateOnly(date) ||
    date > getGameDate()
  )
    return Response.json(
      { error: "Invalid progress query" },
      { status: 400, headers },
    );
  try {
    return Response.json(await readAccountStackProgress(viewer.userId, date), {
      headers,
    });
  } catch {
    return Response.json(
      { error: "Your saved board is temporarily unavailable. Please retry." },
      { status: 503, headers },
    );
  }
}
