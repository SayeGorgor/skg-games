import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function PlusPage() {
  return (
    <main className="site-shell">
      <SiteHeader />
      <section className="plus-page container narrow">
        <span className="eyebrow gold">SKG PLUS</span>
        <h1>Play every game without ads.</h1>
        <p className="lede">
          This starter keeps billing disconnected on purpose. The production
          flow should use Stripe Checkout, a signed webhook, and the{" "}
          <code>subscriptions</code> table as the server source of truth.
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
        <Link className="button primary" href="/">
          Back to games
        </Link>
      </section>
    </main>
  );
}
