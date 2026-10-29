"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useViewer } from "./viewer-provider";
export function AuthFlowEffects() {
  const dialog = useRef<HTMLDialogElement>(null);
  const { viewer } = useViewer();
  useEffect(() => {
    function leaving(event: MouseEvent) {
      const link = (event.target as Element).closest?.("a");
      if (!link) return;
      const target = new URL(link.href);
      if (target.origin !== window.location.origin) return;
      if (
        target.pathname.startsWith("/auth/") ||
        target.pathname === "/plus/start"
      )
        window.dispatchEvent(new Event("skg-auth-leaving"));
    }
    document.addEventListener("click", leaving, true);
    return () => document.removeEventListener("click", leaving, true);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("welcome") !== "plus") return;
    url.searchParams.delete("welcome");
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
    if (viewer.authenticated && !viewer.premium) dialog.current?.showModal();
  }, [viewer.authenticated, viewer.premium]);
  return (
    <dialog
      ref={dialog}
      className="stack-help-dialog auth-welcome"
      aria-labelledby="welcome-title"
    >
      <div className="stack-help-heading">
        <div>
          <span className="eyebrow gold">SKG PLUS</span>
          <h2 id="welcome-title">Welcome to SKG Games</h2>
        </div>
        <button
          className="stack-help-close"
          aria-label="Close welcome"
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
      </div>
      <p>Your account is ready. Play without ads with SKG Plus.</p>
      <p>Enjoy your daily games with no display ads.</p>
      <div className="auth-links">
        <Link className="button primary" href="/plus/start">
          Go ad-free
        </Link>
        <button
          className="button secondary"
          onClick={() => dialog.current?.close()}
        >
          Continue without subscribing
        </button>
      </div>
    </dialog>
  );
}
