import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { AuthForm } from "@/components/auth/auth-form";
import { parseAuthIntent, sanitizeReturnTo } from "@/lib/auth/flow";
import { auth } from "@/lib/auth/server";
export default async function AuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { path } = await params,
    query = await searchParams;
  if (
    path !== "sign-in" &&
    path !== "sign-up" &&
    path !== "forgot-password" &&
    path !== "reset-password"
  )
    notFound();
  const title = {
    "sign-in": "Welcome back",
    "sign-up": "Create your SKG account",
    "forgot-password": "Reset your password",
    "reset-password": "Choose a new password",
  }[path];
  return (
    <main className="site-shell">
      <SiteHeader />
      <section className="container auth-page">
        <div className="panel auth-panel">
          <span className="eyebrow blue">SKG GAMES</span>
          <h1>{title}</h1>
          <p>
            An account is optional. All free Daily and Practice games are
            available without signing up.
          </p>
          <AuthForm
            mode={path}
            intent={parseAuthIntent(query.intent)}
            returnTo={sanitizeReturnTo(query.returnTo)}
            token={query.token}
            initialError={!!query.error}
            enabled={!!auth}
          />
        </div>
      </section>
    </main>
  );
}
