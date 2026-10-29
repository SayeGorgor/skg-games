import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getViewer } from "@/lib/auth/viewer";

export default async function PlusPage() {
  const viewer = await getViewer();
  return (
    <main className="site-shell">
      <SiteHeader />
      <section className="plus-page container narrow">
        <span className="eyebrow gold">SKG PLUS</span>
        <h1>Play every game without ads.</h1>
        <p className="lede">
          Enjoy SKG Games without display ads. Free Daily and Practice games are
          always available without a subscription.
        </p>
        <div className="pricing-grid">
          <article className="panel">
            <h2>Monthly</h2>
            <strong>$4.99</strong>
            <p>Good for testing conversion without a long commitment.</p>
          </article>
          <article className="panel featured">
            <h2>Yearly</h2>
            <strong>$29</strong>
            <p>Recommended primary offer once pricing is validated.</p>
          </article>
        </div>
        {viewer.premium ? (
          <p>
            You already have SKG Plus.{" "}
            <Link href="/account">View your account</Link>
          </p>
        ) : viewer.authenticated ? (
          <p role="status">
            You’re signed in. Payments aren’t available yet; no subscription has
            been started.
          </p>
        ) : (
          <Link className="button primary" href="/plus/start">
            Get SKG Plus
          </Link>
        )}
        <Link className="button primary" href="/">
          Back to games
        </Link>
      </section>
    </main>
  );
}
