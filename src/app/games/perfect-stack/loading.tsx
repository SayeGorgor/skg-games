import { SiteHeader } from "@/components/site-header";

export default function StackLoading() {
  return (
    <main className="site-shell">
      <SiteHeader />
      <section className="container game-feedback" aria-busy="true">
        <div className="panel">
          <span className="eyebrow blue">PERFECT STACK</span>
          <h1>Getting your board ready...</h1>
          <p role="status">Loading your puzzle and saved progress.</p>
        </div>
      </section>
    </main>
  );
}
