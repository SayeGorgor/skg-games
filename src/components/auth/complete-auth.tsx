"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
export function CompleteAuth({
  destination,
  welcome,
  flowKey,
}: {
  destination: string;
  welcome: boolean;
  flowKey: string;
}) {
  const started = useRef(false),
    [failed, setFailed] = useState(false);
  function finish() {
    let show = welcome;
    try {
      const key = `skg-auth-welcome-${flowKey}`;
      if (sessionStorage.getItem(key)) show = false;
      else if (welcome) sessionStorage.setItem(key, "consumed");
    } catch {
      show = false;
    }
    const target = new URL(destination, window.location.origin);
    if (show) target.searchParams.set("welcome", "plus");
    window.location.replace(target.pathname + target.search + target.hash);
  }
  async function claim() {
    setFailed(false);
    try {
      // Reuse the existing browser identity; never clear or replace local games.
      const anonymousId = localStorage.getItem("skg-anonymous-id");
      if (!anonymousId) {
        finish();
        return;
      }
      const response = await fetch("/api/auth/claim-anonymous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymousId }),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!result.persisted) {
        setFailed(true);
        return;
      }
      finish();
    } catch {
      setFailed(true);
    }
  }
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void claim();
    }
  });
  return (
    <div className="panel auth-panel">
      <h1>{failed ? "Your account is ready" : "Finishing sign-in…"}</h1>
      <p>
        {failed
          ? "We couldn’t associate your previous results right now. Your games remain saved in this browser."
          : "Keeping your progress with your account."}
      </p>
      {failed && (
        <div className="button-row">
          <button className="button secondary" onClick={claim}>
            Retry progress claim
          </button>
          <button className="button primary" onClick={finish}>
            Continue
          </button>
        </div>
      )}
      <Link href="/">Back to games</Link>
    </div>
  );
}
