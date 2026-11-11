import * as Sentry from "@sentry/nextjs";
import { getViewer } from "@/lib/auth/viewer";
import { readAccountHistory } from "@/lib/results/server";
import { GAME_NAMES, summarize } from "@/lib/results/shared";
import { accountKey } from "@/lib/auth/account-key";

export async function GET(request: Request) {
  const viewer = await getViewer();
  const headers = { "Cache-Control": "private, no-store" };
  if (!viewer.userId)
    return Response.json({ error: "Sign in first" }, { status: 401, headers });
  const query = new URL(request.url).searchParams;
  const page = Number(query.get("page") ?? 1);
  const game = query.get("game");
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000000 ||
    (game && !Object.hasOwn(GAME_NAMES, game)) ||
    query.has("userId")
  )
    return Response.json(
      { error: "Invalid history query" },
      { status: 400, headers },
    );
  try {
    const all = await readAccountHistory(viewer.userId);
    const history = game ? all.filter((r) => r.gameSlug === game) : all;
    return Response.json(
      {
        accountKey: accountKey(viewer.userId),
        summary: summarize(all),
        results: history.slice((page - 1) * 25, page * 25),
        total: history.length,
        page,
        pageSize: 25,
      },
      { headers },
    );
  } catch {
    Sentry.logger.error("Account history retrieval failed", {
      operation: "read_history",
      feature: "stats",
      outcome: "unexpected_failure",
      status_code: 503,
    });
    return Response.json(
      {
        error:
          "Your account history is temporarily unavailable. Please try again.",
      },
      { status: 503, headers },
    );
  }
}
