import { NextResponse } from "next/server";
import { publishDueChallenges } from "@/lib/db/challenges";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await publishDueChallenges();
  return NextResponse.json({
    ok: true,
    published: count,
    at: new Date().toISOString(),
  });
}
