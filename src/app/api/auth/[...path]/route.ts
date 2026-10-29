import { auth } from "@/lib/auth/server";
const unavailable = () =>
  Response.json(
    {
      message:
        "Account services are not configured yet. Free games are still available.",
    },
    { status: 503 },
  );
const handlers = auth?.handler();
export const GET = handlers?.GET ?? unavailable;
export const POST = handlers?.POST ?? unavailable;
