import { redirect } from "next/navigation";
import Link from "next/link";
import { getViewer } from "@/lib/auth/viewer";
import { SiteHeader } from "@/components/site-header";
export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer.authenticated) redirect("/auth/sign-in?returnTo=%2Faccount");
  return (
    <main className="site-shell">
      <SiteHeader />
      <section className="container auth-page">
        <div className="panel auth-panel">
          <span className="eyebrow blue">YOUR ACCOUNT</span>
          <h1>{viewer.name || "Your account"}</h1>
          <p>{viewer.email}</p>
          <h2>{viewer.premium ? "SKG Plus · Ad-free" : "Free membership"}</h2>
          {!viewer.premium && (
            <Link className="button primary" href="/plus/start">
              Get SKG Plus
            </Link>
          )}
          <p>Your free games remain available every day.</p>
        </div>
      </section>
    </main>
  );
}
