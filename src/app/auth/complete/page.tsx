import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import {
  authUrl,
  parseAuthIntent,
  sanitizeReturnTo,
  shouldShowSignupUpsell,
} from "@/lib/auth/flow";
import { CompleteAuth } from "@/components/auth/complete-auth";
import { SiteHeader } from "@/components/site-header";
export default async function CompletePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams,
    intent = parseAuthIntent(query.intent),
    returnTo = sanitizeReturnTo(query.returnTo),
    viewer = await getViewer();
  if (!viewer.userId)
    redirect(authUrl("sign-in", intent, returnTo) + "&error=session");
  const flowKey = createHash("sha256")
    .update(viewer.userId)
    .digest("hex")
    .slice(0, 24);
  return (
    <main className="site-shell">
      <SiteHeader />
      <section className="container auth-page">
        <CompleteAuth
          destination={intent === "premium" ? "/plus/start" : returnTo}
          welcome={shouldShowSignupUpsell(
            query.new === "1",
            intent,
            viewer.premium,
          )}
          flowKey={flowKey}
        />
      </section>
    </main>
  );
}
