"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { authUrl } from "@/lib/auth/flow";
import { useViewer } from "./viewer-provider";
import { endResultSession } from "@/lib/results/local";
export function AccountControls({
  mode,
  primary = false,
}: {
  mode?: "sign-in" | "sign-up";
  primary?: boolean;
}) {
  const { viewer, adsEnabled } = useViewer();
  const authMode = mode ?? (adsEnabled ? "sign-in" : "sign-up");
  const path = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      window.dispatchEvent(new Event("skg-auth-leaving"));
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      endResultSession();
      window.location.replace(new URL("/", window.location.origin).href);
    } catch {
      setError("Could not sign out. Try again.");
      setBusy(false);
    }
  }
  return (
    <div className="header-account">
      {viewer.authenticated ? (
        <>
          <Link href="/account">
            {adsEnabled && viewer.premium ? "Account · Plus" : "Account"}
          </Link>
          <button type="button" disabled={busy} onClick={signOut}>
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </>
      ) : (
        <>
          <Link
            className={primary ? "header-plus" : "header-sign-in"}
            href={authUrl(authMode, "standard", path)}
            onClick={(event) => {
              event.preventDefault();
              router.push(
                authUrl(
                  authMode,
                  "standard",
                  window.location.pathname + window.location.search,
                ),
              );
            }}
          >
            {authMode === "sign-up" ? "Sign up" : "Sign in"}
          </Link>
        </>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
